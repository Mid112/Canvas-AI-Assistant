import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { StudentMessageDraftPage } from "@/pages/StudentMessageDraftPage";
import { fetchCourseStudents } from "@/services/students";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const RECIPIENT_LOAD_TIMEOUT_MS = 5000;

export function InstructorMessagesPage() {
  const { accessToken, user } = useAuth();
  const { activeCourse, isLoading: isLoadingCourses } = useActiveCourse();
  const canvasUrl = useCanvasConnectionUrl();
  const [fetchOptions, setFetchOptions] =
    useState<FetchMessageDraftOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const basePrompt = useMemo(
    () =>
      activeCourse
        ? `Draft a message for students in ${activeCourse.displayName}.`
        : "Draft a message for students in the active course.",
    [activeCourse],
  );
  const activeFetchOptions =
    activeCourse && fetchOptions?.courseId === activeCourse.localId
      ? fetchOptions
      : null;
  const fallbackFetchOptions = useMemo<FetchMessageDraftOptions | null>(
    () =>
      activeCourse
        ? {
            courseId: activeCourse.localId,
            prompt: basePrompt,
            emptyRecipients: true,
          }
        : null,
    [activeCourse, basePrompt],
  );

  useEffect(() => {
    if (!activeCourse) {
      return;
    }

    if (!accessToken || !canvasUrl) {
      return;
    }

    const token = accessToken;
    const localCourseId = activeCourse.localId;
    const activeLocalCourseId = activeCourse.localId;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadRecipients() {
      setLoadError(null);

      try {
        const students = await Promise.race([
          fetchCourseStudents(localCourseId, token, selectedCanvasUrl),
          new Promise<never>((_, reject) => {
            window.setTimeout(
              () => reject(new Error("Loading students is taking too long.")),
              RECIPIENT_LOAD_TIMEOUT_MS,
            );
          }),
        ]);

        if (
          cancelled ||
          token !== accessToken ||
          localCourseId !== activeLocalCourseId ||
          selectedCanvasUrl !== canvasUrl
        ) {
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
        if (
          cancelled ||
          token !== accessToken ||
          localCourseId !== activeLocalCourseId
        ) {
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

    void loadRecipients();

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeCourse, basePrompt, canvasUrl]);

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <CanvasConnectionRequired description="Connect Canvas to draft messages for your course students." />
      </div>
    );
  }

  if (isLoadingCourses) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Preparing message draft...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeCourse) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select an active course to load real message recipients.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {loadError ? (
        <div className="px-4 pt-4 md:px-6 md:pt-6 lg:px-8 lg:pt-8">
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>
                {loadError} You can still compose a draft, but recipients may
                need to be added manually.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
      <StudentMessageDraftPage
        fetchOptions={activeFetchOptions ?? fallbackFetchOptions ?? undefined}
      />
    </>
  );
}
