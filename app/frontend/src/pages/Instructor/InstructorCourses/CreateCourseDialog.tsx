import { useRef, useState, type FormEvent } from "react";

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
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { toBrowserCanvasUrl } from "@/lib/canvas-url";
import { CanvasApiError, createCourse } from "@/services/canvas";

interface CreateCourseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
}

export function CreateCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateCourseDialogProps) {
  const { accessToken } = useAuth();
  const connectionUrl = useCanvasConnectionUrl();
  const [name, setName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Sync guard — React state alone can miss a second click before re-render.
  const isSubmittingRef = useRef(false);

  const canvasCoursesUrl =
    connectionUrl != null
      ? `${toBrowserCanvasUrl(connectionUrl)}/courses`
      : undefined;

  const resetForm = () => {
    setName("");
    setCourseCode("");
    setPublish(false);
    setError(null);
    setIsSubmitting(false);
    isSubmittingRef.current = false;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSubmitting) {
      return;
    }
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) {
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Course name is required.");
      return;
    }
    if (!accessToken) {
      setError("You must be signed in to create a course.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      await createCourse(
        {
          name: trimmedName,
          course_code: courseCode.trim() || null,
          publish,
        },
        accessToken,
        connectionUrl,
      );
      resetForm();
      onOpenChange(false);
      await onCreated?.();
    } catch (err) {
      setError(
        err instanceof CanvasApiError
          ? err.message
          : "Unable to create the course. Please try again.",
      );
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>Create course</DialogTitle>
          <DialogDescription>
            Create a new course in Canvas. It will appear in your course list
            after creation.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="create-course-name">Course name</Label>
            <Input
              id="create-course-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. COSC 499 Capstone"
              disabled={isSubmitting}
              autoFocus
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="create-course-code">Course code (optional)</Label>
            <Input
              id="create-course-code"
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              placeholder="e.g. COSC499"
              disabled={isSubmitting}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={publish}
              onChange={(event) => setPublish(event.target.checked)}
              disabled={isSubmitting}
              className="size-4 rounded border"
            />
            Publish course immediately
          </label>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {error}
              {canvasCoursesUrl ? (
                <>
                  {" "}
                  You can also{" "}
                  <a
                    href={canvasCoursesUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    create the course in Canvas
                  </a>{" "}
                  and sync it here.
                </>
              ) : null}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? "Creating…" : "Create course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
