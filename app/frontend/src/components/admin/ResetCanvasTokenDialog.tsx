// Admin UI note: presents reset canvas token dialog controls for institution/admin workflows with service-backed state.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  resetInstructorCanvasToken,
  type AdminCanvasConnection,
} from "@/services/adminCanvasConnections";

interface ResetCanvasTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructorId: string;
  instructorName: string;
  /** Prefilled Canvas URL — the connection this dialog was opened for, if any. */
  canvasUrl?: string;
  /** True when opened for a specific already-known connection (Canvas URL
   * isn't editable); false for adding a brand-new connection. */
  lockUrl?: boolean;
  onSuccess: (connections: AdminCanvasConnection[]) => void;
}

export function ResetCanvasTokenDialog({
  open,
  onOpenChange,
  instructorId,
  instructorName,
  canvasUrl = "",
  lockUrl = false,
  onSuccess,
}: ResetCanvasTokenDialogProps) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState(canvasUrl);
  const [token, setToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form fields whenever the dialog reopens for a (possibly different) connection
      setUrl(canvasUrl);
      setToken("");
      setError(null);
    }
  }, [open, canvasUrl]);

  const canSubmit = Boolean(accessToken) && url.trim() !== "" && token.trim() !== "";

  async function handleSubmit() {
    if (!accessToken || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const connections = await resetInstructorCanvasToken(accessToken, instructorId, {
        canvasUrl: url.trim(),
        canvasToken: token.trim(),
      });
      onSuccess(connections);
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update this Canvas connection.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{lockUrl ? "Reset Canvas token" : "Add Canvas connection"}</DialogTitle>
          <DialogDescription>
            The new token is verified against Canvas before it's saved. Once
            saved, {instructorName}&apos;s old token for this connection stops
            working immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-canvas-url">Canvas URL</Label>
            <Input
              id="reset-canvas-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={lockUrl || isSubmitting}
              placeholder="https://canvas.example.edu"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-canvas-token">New Canvas API token</Label>
            <Input
              id="reset-canvas-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={isSubmitting}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {isSubmitting ? "Verifying..." : "Update token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
