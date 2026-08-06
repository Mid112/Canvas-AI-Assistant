// Instructor page note: coordinates create course dialog UI state with Canvas-backed services and active-course context.

import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

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
import {
  canvasConnectionRequiredMessage,
  isCanvasConnectionRequiredError,
} from "@/lib/canvas-connection";
import { toBrowserCanvasUrl } from "@/lib/canvas-url";
import {
  COURSE_CODE_HELP_TEXT,
  validateCourseCode,
} from "@/lib/course-code-validation";
import { instructorSettingsPath } from "@/routes/paths";
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
  const [courseCodeError, setCourseCodeError] = useState<string | null>(null);
  const [publish, setPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
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
    setCourseCodeError(null);
    setPublish(false);
    setError(null);
    setNeedsReconnect(false);
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
      setNeedsReconnect(false);
      return;
    }
    if (!accessToken) {
      setError("You must be signed in to create a course.");
      setNeedsReconnect(false);
      return;
    }
    if (!connectionUrl) {
      setError(canvasConnectionRequiredMessage());
      setNeedsReconnect(true);
      return;
    }
    const trimmedCourseCode = courseCode.trim();
    const nextCourseCodeError = validateCourseCode(trimmedCourseCode);
    if (nextCourseCodeError) {
      setCourseCodeError(nextCourseCodeError);
      setError(null);
      setNeedsReconnect(false);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    setNeedsReconnect(false);
    try {
      await createCourse(
        {
          name: trimmedName,
          course_code: trimmedCourseCode || null,
          publish,
        },
        accessToken,
        connectionUrl,
      );
      resetForm();
      onOpenChange(false);
      await onCreated?.();
    } catch (err) {
      if (isCanvasConnectionRequiredError(err)) {
        setError(canvasConnectionRequiredMessage(err));
        setNeedsReconnect(true);
      } else {
        setError(
          err instanceof CanvasApiError
            ? err.message
            : "Unable to create the course. Please try again.",
        );
        setNeedsReconnect(false);
      }
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
              onChange={(event) => {
                const nextCourseCode = event.target.value;
                setCourseCode(nextCourseCode);
                setCourseCodeError(validateCourseCode(nextCourseCode));
              }}
              onBlur={() => setCourseCodeError(validateCourseCode(courseCode))}
              placeholder="e.g. COSC 499"
              disabled={isSubmitting}
              aria-describedby="create-course-code-help"
              aria-invalid={courseCodeError ? "true" : undefined}
            />
            <p
              id="create-course-code-help"
              className={
                courseCodeError
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {courseCodeError ?? COURSE_CODE_HELP_TEXT}
            </p>
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
            <div
              role="alert"
              className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <p>{error}</p>
              {needsReconnect ? (
                <Link
                  to={instructorSettingsPath("canvas")}
                  className="inline-flex h-8 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Reconnect Canvas
                </Link>
              ) : canvasCoursesUrl ? (
                <p>
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
                </p>
              ) : null}
            </div>
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
