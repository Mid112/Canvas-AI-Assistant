// Admin UI note: presents instructor canvas connections dialog controls for institution/admin workflows with service-backed state.

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResetCanvasTokenDialog } from "@/components/admin/ResetCanvasTokenDialog";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchInstructorCanvasConnections,
  type AdminCanvasConnection,
} from "@/services/adminCanvasConnections";
import { getInstructorFullName, type Instructor } from "@/types/instructor";

interface InstructorCanvasConnectionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructor: Instructor | null;
}

export function InstructorCanvasConnectionsDialog({
  open,
  onOpenChange,
  instructor,
}: InstructorCanvasConnectionsDialogProps) {
  const { accessToken } = useAuth();
  const [connections, setConnections] = useState<AdminCanvasConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ canvasUrl: string; lockUrl: boolean } | null>(
    null,
  );

  const loadConnections = useCallback(async () => {
    if (!accessToken || !instructor) {
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchInstructorCanvasConnections(accessToken, instructor.id);
      setConnections(data);
    } catch {
      setLoadError("Unable to load Canvas connections.");
      setConnections([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, instructor]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- async connections load on open
      void loadConnections();
    }
  }, [open, loadConnections]);

  if (!instructor) {
    return null;
  }

  const fullName = getInstructorFullName(instructor);

  return (
    <>
      <Dialog open={open && resetTarget === null} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Canvas connections</DialogTitle>
            <DialogDescription>
              {fullName}&apos;s Canvas connections. An instructor can have more
              than one, one per Canvas instance/school.
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="py-6 text-sm text-muted-foreground">Loading…</p>
          ) : loadError ? (
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
          ) : connections.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No Canvas connections yet.
            </p>
          ) : (
            <ul className="divide-y">
              {connections.map((connection) => (
                <li
                  key={connection.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">{connection.canvas_url}</p>
                    <Badge variant={connection.last_sync_error ? "destructive" : "default"}>
                      {connection.last_sync_error ? "Needs reconnect" : "Healthy"}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setResetTarget({ canvasUrl: connection.canvas_url, lockUrl: true })
                    }
                  >
                    Reset token
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setResetTarget({ canvasUrl: "", lockUrl: false })}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add Canvas connection
          </Button>
        </DialogContent>
      </Dialog>

      {resetTarget ? (
        <ResetCanvasTokenDialog
          open={resetTarget !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setResetTarget(null);
            }
          }}
          instructorId={instructor.id}
          instructorName={fullName}
          canvasUrl={resetTarget.canvasUrl}
          lockUrl={resetTarget.lockUrl}
          onSuccess={(updated) => {
            setConnections(updated);
            setResetTarget(null);
          }}
        />
      ) : null}
    </>
  );
}
