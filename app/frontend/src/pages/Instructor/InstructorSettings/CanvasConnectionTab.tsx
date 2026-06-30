import {
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Loader2,
  Mail,
  Upload,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeCanvasUrl } from "@/lib/canvas-url";
import { useCanvasTokenValidation } from "@/lib/useCanvasTokenValidation";
import {
  ConnectCanvasTokenStatus,
} from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import {
  CanvasApiError,
  removeCanvasConnection,
  updateCanvasToken,
} from "@/services/canvas";
import type { CanvasConnection } from "@/types/user";

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

interface ConnectionFormState {
  canvasUrl: string;
  canvasToken: string;
}

export function CanvasConnectionTab() {
  const { user, accessToken, refreshUser } = useAuth();
  const [formState, setFormState] = useState<ConnectionFormState>({
    canvasUrl: "",
    canvasToken: "",
  });
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<number | null>(null);
  const [isEditingConnection, setIsEditingConnection] = useState(false);
  const { urlError, validation: tokenValidation } = useCanvasTokenValidation(
    formState.canvasToken,
    formState.canvasUrl,
    accessToken,
  );

  const connections = user?.canvas_connections ?? [];
  const hasConnections = connections.length > 0;
  const showConnectionForm = !hasConnections || isEditingConnection;

  const canSave =
    formState.canvasToken.trim() !== "" &&
    urlError === null &&
    tokenValidation.status === "valid" &&
    !isSaving;

  const handleSave = async () => {
    if (!accessToken || !canSave) {
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      await updateCanvasToken(
        formState.canvasToken.trim(),
        accessToken,
        normalizeCanvasUrl(formState.canvasUrl),
      );
      await refreshUser();
      setFormState({ canvasUrl: "", canvasToken: "" });
      setIsEditingConnection(false);
      setStatusMessage({
        type: "success",
        text: "Canvas connection saved successfully.",
      });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof CanvasApiError
            ? error.message
            : "Unable to save Canvas connection. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplace = (connection: CanvasConnection) => {
    setFormState({
      canvasUrl: connection.canvas_url,
      canvasToken: "",
    });
    setStatusMessage(null);
    setIsEditingConnection(true);
  };

  const handleCancelEdit = () => {
    setFormState({ canvasUrl: "", canvasToken: "" });
    setIsEditingConnection(false);
  };

  const handleDisconnect = async (connectionId: number) => {
    if (!accessToken) {
      return;
    }

    setDisconnectingId(connectionId);
    setStatusMessage(null);

    try {
      await removeCanvasConnection(connectionId, accessToken);
      await refreshUser();
      setIsEditingConnection(false);
      setFormState({ canvasUrl: "", canvasToken: "" });
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
        <p
          role={statusMessage.type === "error" ? "alert" : "status"}
          className={
            statusMessage.type === "success"
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : "rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          }
        >
          {statusMessage.text}
        </p>
      ) : null}

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Canvas Connection</CardTitle>
          <p className="text-sm text-muted-foreground">
            Connect your Canvas account to sync courses, assignments, and student
            data. Saved tokens are encrypted and never shown again after submission.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {connections.length > 0 ? (
            <div className="space-y-3">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-emerald-700">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        <p className="text-sm font-semibold">Connected to Canvas</p>
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
                        onClick={() => handleReplace(connection)}
                      >
                        Replace token
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={disconnectingId === connection.id}
                        onClick={() => void handleDisconnect(connection.id)}
                      >
                        {disconnectingId === connection.id
                          ? "Disconnecting..."
                          : "Disconnect"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No Canvas connection yet. Add your institution URL and API token
              below.
            </div>
          )}

          {showConnectionForm ? (
            <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {hasConnections ? "Replace connection" : "Connect Canvas"}
                </p>
                {hasConnections ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={handleCancelEdit}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-canvas-url">Canvas URL</Label>
                <Input
                  id="settings-canvas-url"
                  type="url"
                  autoComplete="url"
                  placeholder="https://canvas.university.edu"
                  value={formState.canvasUrl}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      canvasUrl: event.target.value,
                    }))
                  }
                  aria-invalid={Boolean(urlError)}
                />
                {urlError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {urlError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="settings-canvas-token">Canvas API Token</Label>
                <Input
                  id="settings-canvas-token"
                  type="password"
                  autoComplete="off"
                  placeholder="Paste a new Canvas access token"
                  value={formState.canvasToken}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      canvasToken: event.target.value,
                    }))
                  }
                />
                <ConnectCanvasTokenStatus validation={tokenValidation} />
                <p className="text-xs text-muted-foreground">
                  For security, saved tokens are never displayed after submission.
                </p>
              </div>

              <Button type="button" disabled={!canSave} onClick={() => void handleSave()}>
                {isSaving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Saving...
                  </>
                ) : (
                  "Save Canvas Connection"
                )}
              </Button>
            </div>
          ) : null}

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
