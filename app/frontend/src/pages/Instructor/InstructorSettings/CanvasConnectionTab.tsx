import {
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useState } from "react";

import { CanvasConnectionEntry } from "@/components/canvas/CanvasConnectionEntry";
import {
  createCanvasConnectionEntry,
  isCanvasTokenValidationComplete,
  type CanvasConnectionEntryState,
} from "@/components/canvas/canvasConnectionEntryUtils";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import { ConnectCanvasTokenStatus } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import {
  CanvasApiError,
  describeCanvasConnectionFailures,
  removeCanvasConnection,
  updateCanvasConnections,
  updateCanvasToken,
} from "@/services/canvas";
import type { CanvasConnectionFailure } from "@/services/canvas";
import type { TokenValidationState } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import type { CanvasConnection } from "@/types/user";
import { useCanvasTokenValidation } from "@/lib/useCanvasTokenValidation";

const PERMISSIONS = [
  {
    title: "View courses and assignments",
    description: "Access course lists, assignment details, and requirements",
    icon: Eye,
    allowed: true,
  },
  {
    title: "View student submissions",
    description: "Read student work and submission status",
    icon: Upload,
    allowed: true,
  },
  {
    title: "Draft announcements and messages",
    description: "Create drafts for instructor review before sending",
    icon: Mail,
    allowed: true,
  },
  {
    title: "Modify grades directly",
    description: "Grade changes always require instructor approval",
    icon: FileText,
    allowed: false,
  },
] as const;

function formatSyncedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SavedConnectionCard({
  connection,
  isDisconnecting,
  isEditing,
  onEdit,
  onDelete,
}: {
  connection: CanvasConnection;
  isDisconnecting: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            <p className="text-sm font-semibold">Connected</p>
          </div>
          <p className="text-sm font-medium">{connection.canvas_url}</p>
          {connection.time_zone ? (
            <p className="text-sm text-muted-foreground">
              Canvas timezone:{" "}
              <span className="font-medium text-foreground">{connection.time_zone}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Last synced: {formatSyncedAt(connection.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDisconnecting || isEditing}
            onClick={onEdit}
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isDisconnecting || isEditing}
            onClick={onDelete}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {isDisconnecting ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CanvasConnectionTab() {
  const { user, accessToken, refreshUser } = useAuth();
  const connections = user?.canvas_connections ?? [];
  // When already connected, start with no empty add-form card — the green
  // Connected status above is the single connection state (#1294). Users add
  // another institution explicitly via the CTA below.
  const [newEntries, setNewEntries] = useState<CanvasConnectionEntryState[]>(() =>
    (user?.canvas_connections?.length ?? 0) > 0
      ? []
      : [createCanvasConnectionEntry()],
  );
  const [editingConnection, setEditingConnection] = useState<CanvasConnection | null>(
    null,
  );
  const [editToken, setEditToken] = useState("");
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);

  const { urlError: editUrlError, validation: editValidation } =
    useCanvasTokenValidation(
      editToken,
      editingConnection?.canvas_url ?? "",
      accessToken,
    );

  const completedNewConnections = newEntries
    .map((entry) => ({
      canvasUrl: normalizeCanvasUrl(entry.canvasUrl),
      canvasToken: entry.canvasToken.trim(),
    }))
    .filter((connection) => connection.canvasToken !== "");

  const isValidatingNewTokens = newEntries.some((entry) => {
    const trimmedToken = entry.canvasToken.trim();
    return trimmedToken !== "" && entry.validation.status === "validating";
  });

  const allNewConnectionsValid = newEntries.every((entry) => {
    const trimmedToken = entry.canvasToken.trim();

    if (trimmedToken === "") {
      return true;
    }

    return (
      validateCanvasUrl(entry.canvasUrl) === null &&
      isCanvasTokenValidationComplete(entry.canvasToken, entry.validation)
    );
  });

  const canSaveNew =
    completedNewConnections.length > 0 &&
    allNewConnectionsValid &&
    !isValidatingNewTokens &&
    !isSavingNew &&
    !editingConnection;

  const canSaveEdit =
    editingConnection !== null &&
    editToken.trim() !== "" &&
    editUrlError === null &&
    editValidation.status === "valid" &&
    !isSavingEdit;

  const updateNewField = (
    id: string,
    field: "canvasUrl" | "canvasToken",
    value: string,
  ) => {
    setNewEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const updateNewValidation = useCallback(
    (id: string, validation: TokenValidationState) => {
      setNewEntries((current) => {
        let changed = false;
        const next = current.map((entry) => {
          if (entry.id !== id || entry.validation.status === validation.status) {
            return entry;
          }

          changed = true;
          return { ...entry, validation };
        });

        return changed ? next : current;
      });
    },
    [],
  );

  const addConnectionField = () => {
    setNewEntries((current) => [...current, createCanvasConnectionEntry()]);
  };

  const removeConnectionField = (id: string) => {
    setNewEntries((current) => {
      const next = current.filter((entry) => entry.id !== id);
      // Keep at least one blank form when nothing is saved yet.
      if (next.length === 0 && connections.length === 0) {
        return [createCanvasConnectionEntry()];
      }
      return next;
    });
  };

  const resetNewEntries = () => {
    // Collapse the add form after a successful save so a connected user does
    // not immediately see another empty Institution card (#1294).
    setNewEntries([]);
  };

  const keepFailedEntries = (failed: CanvasConnectionFailure[]) => {
    const failedKeys = new Set(
      failed.map(
        ({ connection }) => `${connection.canvasUrl}\u0000${connection.canvasToken}`,
      ),
    );
    setNewEntries((current) => {
      const remaining = current.filter((entry) =>
        failedKeys.has(
          `${normalizeCanvasUrl(entry.canvasUrl)}\u0000${entry.canvasToken.trim()}`,
        ),
      );
      return remaining.length > 0 ? remaining : current;
    });
  };

  const handleSaveNew = async () => {
    if (!accessToken || !canSaveNew) {
      return;
    }

    setIsSavingNew(true);
    setStatusMessage(null);

    try {
      const result = await updateCanvasConnections(
        completedNewConnections,
        accessToken,
      );
      await refreshUser();

      if (result.failed.length === 0) {
        resetNewEntries();
        setStatusMessage({
          type: "success",
          text:
            result.succeeded.length === 1
              ? "Canvas connection saved successfully."
              : `${result.succeeded.length} Canvas connections saved successfully.`,
        });
      } else if (result.succeeded.length > 0) {
        // Partial success: drop the saved entries from the form and keep the
        // ones that failed so the user can fix and retry just those.
        keepFailedEntries(result.failed);
        setStatusMessage({
          type: "error",
          text: `Saved ${result.succeeded.length} of ${completedNewConnections.length} connections. Could not save — ${describeCanvasConnectionFailures(result.failed)}`,
        });
      } else {
        setStatusMessage({
          type: "error",
          text:
            describeCanvasConnectionFailures(result.failed) ||
            "Unable to save Canvas connections. Please try again.",
        });
      }
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof CanvasApiError
            ? error.message
            : "Unable to save Canvas connections. Please try again.",
      });
    } finally {
      setIsSavingNew(false);
    }
  };

  const handleStartEdit = (connection: CanvasConnection) => {
    setEditingConnection(connection);
    setEditToken("");
    setStatusMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingConnection(null);
    setEditToken("");
  };

  const handleSaveEdit = async () => {
    if (!accessToken || !editingConnection || !canSaveEdit) {
      return;
    }

    setIsSavingEdit(true);
    setStatusMessage(null);

    try {
      await updateCanvasToken(
        editToken.trim(),
        accessToken,
        normalizeCanvasUrl(editingConnection.canvas_url),
      );
      await refreshUser();
      handleCancelEdit();
      setStatusMessage({
        type: "success",
        text: "Canvas connection updated successfully.",
      });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof CanvasApiError
            ? error.message
            : "Unable to update Canvas connection. Please try again.",
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async (connectionId: number) => {
    if (!accessToken) {
      return;
    }

    const deletingLastConnection = connections.length === 1;
    setDisconnectingId(connectionId);
    setStatusMessage(null);

    try {
      await removeCanvasConnection(connectionId, accessToken);
      await refreshUser();
      if (editingConnection?.id === connectionId) {
        handleCancelEdit();
      }
      if (deletingLastConnection && newEntries.length === 0) {
        setNewEntries([createCanvasConnectionEntry()]);
      }
      setStatusMessage({
        type: "success",
        text: "Canvas connection removed.",
      });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof CanvasApiError
            ? error.message
            : "Unable to remove Canvas connection. Please try again.",
      });
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage ? (
        statusMessage.type === "success" ? (
          <p
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {statusMessage.text}
          </p>
        ) : (
          <ErrorAlert message={statusMessage.text} />
        )
      ) : null}

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Canvas Connection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect one or more Canvas accounts to sync courses, assignments, and
            student data. Saved tokens are encrypted and never shown again after
            submission.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {connections.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Saved connections</p>
              {connections.map((connection) => (
                <div key={connection.id} className="space-y-3">
                  <SavedConnectionCard
                    connection={connection}
                    isDisconnecting={disconnectingId === connection.id}
                    isEditing={editingConnection?.id === connection.id}
                    onEdit={() => handleStartEdit(connection)}
                    onDelete={() => void handleDelete(connection.id)}
                  />
                  {editingConnection?.id === connection.id ? (
                    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">Edit connection</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSavingEdit}
                          onClick={handleCancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                          Canvas URL
                        </p>
                        <p className="rounded-lg border bg-background px-3 py-2 text-sm">
                          {editingConnection.canvas_url}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="settings-edit-canvas-token">
                          New Canvas API Token
                        </Label>
                        <Input
                          id="settings-edit-canvas-token"
                          type="password"
                          autoComplete="off"
                          placeholder="Paste a new Canvas access token"
                          value={editToken}
                          onChange={(event) => setEditToken(event.target.value)}
                        />
                        <ConnectCanvasTokenStatus validation={editValidation} />
                        <p className="text-xs text-muted-foreground">
                          For security, saved tokens are never displayed after
                          submission.
                        </p>
                      </div>
                      <Button
                        type="button"
                        disabled={!canSaveEdit}
                        onClick={() => void handleSaveEdit()}
                      >
                        {isSavingEdit ? (
                          <>
                            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                            Saving...
                          </>
                        ) : (
                          "Save changes"
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No Canvas connections yet. Add your institution URL and API token
              below.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">
                {connections.length > 0 ? "Add more connections" : "Connect Canvas"}
              </p>
              <p className="text-sm text-muted-foreground">
                {connections.length > 0 && newEntries.length === 0
                  ? "Your connection status is shown above. Add another institution only if you need a second Canvas account."
                  : "Add one or more institution URLs and tokens. Each token is validated before saving."}
              </p>
            </div>

            <div className="space-y-4">
              {newEntries.map((entry, index) => (
                <CanvasConnectionEntry
                  key={entry.id}
                  entry={entry}
                  index={index}
                  accessToken={accessToken}
                  isSubmitting={isSavingNew}
                  canRemove={
                    newEntries.length > 1 || connections.length > 0
                  }
                  onFieldChange={updateNewField}
                  onValidationChange={updateNewValidation}
                  onRemove={removeConnectionField}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                disabled={isSavingNew || Boolean(editingConnection)}
                onClick={addConnectionField}
                className="h-10 w-full rounded-lg border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add another institution
              </Button>
            </div>

            {newEntries.length > 0 ? (
              <Button
                type="button"
                disabled={!canSaveNew}
                onClick={() => void handleSaveNew()}
              >
                {isSavingNew ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : connections.length > 0 ? (
                  "Save new connections"
                ) : (
                  "Save Canvas Connection"
                )}
              </Button>
            ) : null}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Permissions</p>
            <ul className="space-y-2">
              {PERMISSIONS.map((permission) => (
                <li
                  key={permission.title}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
                >
                  <permission.icon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{permission.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {permission.description}
                    </p>
                  </div>
                  {permission.allowed ? (
                    <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-medium text-amber-700">Review</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
