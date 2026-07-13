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
  removeCanvasConnection,
  updateCanvasConnections,
  updateCanvasToken,
} from "@/services/canvas";
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
  const [newEntries, setNewEntries] = useState<CanvasConnectionEntryState[]>(() => [
    createCanvasConnectionEntry(),
  ]);
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

  const connections = user?.canvas_connections ?? [];

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
    setNewEntries((current) =>
      current.length === 1
        ? current
        : current.filter((entry) => entry.id !== id),
    );
  };

  const resetNewEntries = () => {
    setNewEntries([createCanvasConnectionEntry()]);
  };

  const handleSaveNew = async () => {
    if (!accessToken || !canSaveNew) {
      return;
    }

    setIsSavingNew(true);
    setStatusMessage(null);

    try {
      await updateCanvasConnections(completedNewConnections, accessToken);
      await refreshUser();
      resetNewEntries();
      setStatusMessage({
        type: "success",
        text:
          completedNewConnections.length === 1
            ? "Canvas connection saved successfully."
            : `${completedNewConnections.length} Canvas connections saved successfully.`,
      });
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

    setDisconnectingId(connectionId);
    setStatusMessage(null);

    try {
      await removeCanvasConnection(connectionId, accessToken);
      await refreshUser();
      if (editingConnection?.id === connectionId) {
        handleCancelEdit();
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
                Add one or more institution URLs and tokens. Each token is validated
                before saving.
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
                  canRemove={newEntries.length > 1}
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
