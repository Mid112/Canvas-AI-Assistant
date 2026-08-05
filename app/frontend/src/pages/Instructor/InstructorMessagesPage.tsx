import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { MessageInboxPanel } from "@/components/messages/MessageInboxPanel";
import {
  MessageDraftPage,
  MessageDraftPageHeader,
} from "@/components/messages/MessageDraftPage";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import {
  type AiMessageDraftLocationState,
} from "@/routes/paths";
import { fetchCourseStudentsWithSubmissionFallback } from "@/services/students";
import { toStudentEmailRecipients } from "@/lib/student-analytics";
import type { FetchMessageDraftOptions } from "@/types/messageDraft";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

const RECIPIENT_LOAD_TIMEOUT_MS = 5000;

export function InstructorMessagesPage() {
  const { accessToken, user } = useAuth();
  const {
    activeCourse,
    availableCourses,
    isLoading: isLoadingCourses,
  } = useActiveCourse();
  const canvasUrl = useCanvasConnectionUrl();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [fetchOptions, setFetchOptions] =
    useState<FetchMessageDraftOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const aiDraft = (location.state as AiMessageDraftLocationState | null)
    ?.aiMessageDraft;
  // Seed from the URL/AI draft on first paint so "?tab=compose" does not
  // briefly mount the inbox panel (which made Subject-field assertions flake
  // when the roster error banner appeared first).
  const [tab, setTab] = useState(() =>
    searchParams.get("tab") === "compose" || aiDraft ? "compose" : "inbox",
  );

  // The draft's own resolved course (set by the assistant handoff or a typed
  // draft resume — see resolveTypedDraftCourseId) wins over whatever happens
  // to be active right now. Composing used to always target activeCourse,
  // so switching the active course between drafting and resuming silently
  // retargeted the message at the new one, same failure as #1509/#1515 but
  // for the message compose path, which never picked up that fix. The
  // active course remains the only fallback for a fresh compose with no
  // draft, or a legacy draft that never carried a course.
  const composeCourseId = aiDraft?.courseId ?? activeCourse?.localId;
  const composeCourse = useMemo(
    () =>
      composeCourseId !== undefined
        ? availableCourses.find((course) => course.id === composeCourseId) ?? null
        : null,
    [availableCourses, composeCourseId],
  );
  const composeCourseLabel = composeCourse?.name ?? activeCourse?.displayName;

  const basePrompt = useMemo(
    () =>
      composeCourseLabel ?
        `Draft a message for students in ${composeCourseLabel}.`
      : "Draft a message for students in the active course.",
    [composeCourseLabel],
  );
  const activeFetchOptions =
    composeCourseId !== undefined && fetchOptions?.courseId === composeCourseId ?
      fetchOptions
    : null;
  const fallbackFetchOptions = useMemo<FetchMessageDraftOptions | null>(
    () =>
      composeCourseId !== undefined ?
        {
          courseId: composeCourseId,
          prompt: aiDraft?.prompt ?? basePrompt,
          subject: aiDraft?.subject,
          body: aiDraft?.body,
          emptyRecipients: true,
          conversationId: aiDraft?.conversationId,
          canvasUrl,
        }
      : null,
    [aiDraft, basePrompt, canvasUrl, composeCourseId],
  );
  const draftSeedKey = [
    aiDraft?.subject ?? "",
    aiDraft?.body ?? "",
    aiDraft?.prompt ?? "",
    aiDraft?.conversationId ?? "",
    (aiDraft?.recipientIds ?? []).join(","),
  ].join("|");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "compose" || aiDraft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab to URL/AI draft on load
      setTab("compose");
    }
  }, [aiDraft, searchParams]);

  useEffect(() => {
    if (composeCourseId === undefined) {
      return;
    }

    if (!accessToken || !canvasUrl) {
      return;
    }

    const token = accessToken;
    const localCourseId = composeCourseId;
    const activeLocalCourseId = composeCourseId;
    const selectedCanvasUrl = canvasUrl;
    const expectedStudentCount = composeCourse?.studentCount ?? 0;
    let cancelled = false;

    async function loadRecipients() {
      setLoadError(null);

      try {
        const students = await Promise.race([
          fetchCourseStudentsWithSubmissionFallback(
            localCourseId,
            token,
            selectedCanvasUrl,
            expectedStudentCount,
          ),
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

        // Always keep the full roster visible. AI-selected recipients are
        // pre-checked via preSelectedIds rather than filtering the list.
        const recipients = toStudentEmailRecipients(students);
        const preferredIds = aiDraft?.recipientIds;

        setFetchOptions({
          courseId: localCourseId,
          prompt: aiDraft?.prompt ?? basePrompt,
          subject: aiDraft?.subject,
          body: aiDraft?.body,
          recipients,
          preSelectedIds:
            preferredIds && preferredIds.length > 0 ? preferredIds : undefined,
          conversationId: aiDraft?.conversationId,
          canvasUrl: selectedCanvasUrl,
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
          error instanceof Error ?
            error.message
          : "Unable to load course students for messaging.",
        );
        setFetchOptions({
          courseId: localCourseId,
          prompt: aiDraft?.prompt ?? basePrompt,
          subject: aiDraft?.subject,
          body: aiDraft?.body,
          emptyRecipients: true,
          conversationId: aiDraft?.conversationId,
          canvasUrl: selectedCanvasUrl,
        });
      }
    }

    void loadRecipients();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    aiDraft,
    basePrompt,
    canvasUrl,
    composeCourse?.studentCount,
    composeCourseId,
  ]);

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <CanvasConnectionRequired description="Connect Canvas to draft messages for your course students." />
      </div>
    );
  }

  if (isLoadingCourses && composeCourseId === undefined) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin text-primary"
              aria-hidden="true"
            />
            Preparing messages...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Messages
        </h1>
        <p className="text-sm text-muted-foreground">
          {composeCourseLabel
            ? `View conversations and student replies, or compose a new message for ${composeCourseLabel}.`
            : "View conversations across all courses. Select an active course to compose a new message."}
        </p>
      </header>

      {loadError ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p>
              {loadError} You can still compose a draft, but recipients may need
              to be added manually.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox & replies</TabsTrigger>
          <TabsTrigger value="compose">Compose</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">
          <MessageInboxPanel courseId={activeCourse?.localId} />
        </TabsContent>
        <TabsContent value="compose" className="mt-4 space-y-6">
          {composeCourseId === undefined ? (
            <Card className="shadow-sm ring-1 ring-border/60">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Select an active course to compose a new message.
              </CardContent>
            </Card>
          ) : (
            <>
              <MessageDraftPageHeader />
              <MessageDraftPage
                key={draftSeedKey || "default-draft"}
                fetchOptions={
                  activeFetchOptions ?? fallbackFetchOptions ?? undefined
                }
                onCancel={() => setTab("inbox")}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
