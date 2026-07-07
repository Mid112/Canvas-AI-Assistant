import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { MessageDraftPage } from "@/components/messages/MessageDraftPage";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useInstructorCourseOutletContext } from "@/hooks/useInstructorCourseOutletContext";
import { fetchCourseStudents } from "@/services/students";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";

export function InstructorCourseMessagesPage() {
  const { accessToken } = useAuth();
  const layoutContext = useInstructorCourseOutletContext();
  const [fetchOptions, setFetchOptions] = useState<FetchMessageDraftOptions | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const localCourseId = layoutContext?.localCourseId ?? 0;
  const course = layoutContext?.course ?? null;
  const canvasUrl = layoutContext?.canvasUrl;

  const basePrompt = useMemo(
    () =>
      course
        ? `Draft a message for students in ${formatInstructorCourseTitle(course)}.`
        : "Draft a message for students in this course.",
    [course],
  );

  useEffect(() => {
    if (!layoutContext || !accessToken) {
      return;
    }

    if (!course?.canvasCourseId || !canvasUrl) {
      setFetchOptions({
        courseId: localCourseId,
        prompt: basePrompt,
      });
      return;
    }

    const token = accessToken;
    const canvasCourseId = course.canvasCourseId;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadCourseRecipients() {
      setLoadError(null);

      try {
        const students = await fetchCourseStudents(
          canvasCourseId,
          token,
          selectedCanvasUrl,
        );

        if (cancelled) {
          return;
        }

        setFetchOptions({
          courseId: localCourseId,
          prompt: basePrompt,
          recipients: students.map((student) => ({
            id: student.canvas_user_id,
            name: student.name,
            email: student.login_id ?? "",
          })),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load course students for messaging.",
        );
        setFetchOptions({
          courseId: localCourseId,
          prompt: basePrompt,
          emptyRecipients: true,
        });
      }
    }

    void loadCourseRecipients();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    basePrompt,
    canvasUrl,
    course?.canvasCourseId,
    layoutContext,
    localCourseId,
  ]);

  if (!layoutContext) {
    return null;
  }

  if (!fetchOptions) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          Preparing course message draft...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              {loadError} You can still compose a draft, but recipients may need
              to be added manually.
            </p>
          </CardContent>
        </Card>
      ) : null}
      <MessageDraftPage fetchOptions={fetchOptions} />
    </div>
  );
}
