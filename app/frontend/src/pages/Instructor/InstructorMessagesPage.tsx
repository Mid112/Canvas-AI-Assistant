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

  const basePrompt = useMemo(
    () =>
      activeCourse ?
        `Draft a message for students in ${activeCourse.displayName}.`
      : "Draft a message for students in the active course.",
    [activeCourse],
  );
  const activeFetchOptions =
    activeCourse && fetchOptions?.courseId === activeCourse.localId ?
      fetchOptions
    : null;
  const activeCourseDetails = useMemo(
    () =>
      activeCourse ?
        availableCourses.find((course) => course.id === activeCourse.localId)
      : null,
    [activeCourse, availableCourses],
  );
  const fallbackFetchOptions = useMemo<FetchMessageDraftOptions | null>(
    () =>
      activeCourse ?
        {
          courseId: activeCourse.localId,
          prompt: aiDraft?.prompt ?? basePrompt,
          subject: aiDraft?.subject,
          body: aiDraft?.body,
          emptyRecipients: true,
        }
      : null,
    [activeCourse, aiDraft, basePrompt],
  );
  const draftSeedKey = [
    aiDraft?.subject ?? "",
    aiDraft?.body ?? "",
    aiDraft?.prompt ?? "",
  ].join("|");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "compose" || aiDraft) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync tab to URL/AI draft on load
      setTab("compose");
    }
  }, [aiDraft, searchParams]);

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
    const expectedStudentCount = activeCourseDetails?.studentCount ?? 0;
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

        // Exclude pending/identity-less students so the recipient list matches
        // the addresses that can actually receive a message.
        const recipients = toStudentEmailRecipients(students);
        const preferredIds = aiDraft?.recipientIds;
        const seededRecipients =
          preferredIds && preferredIds.length > 0 ?
            recipients.filter((recipient) => preferredIds.includes(recipient.id))
          : recipients;

        setFetchOptions({
          courseId: localCourseId,
          prompt: aiDraft?.prompt ?? basePrompt,
          subject: aiDraft?.subject,
          body: aiDraft?.body,
          recipients:
            seededRecipients.length > 0 ? seededRecipients : recipients,
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
        });
      }
    }

    void loadRecipients();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeCourse,
    activeCourseDetails?.studentCount,
    aiDraft,
    basePrompt,
    canvasUrl,
  ]);

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <CanvasConnectionRequired description="Connect Canvas to draft messages for your course students." />
      </div>
    );
  }

  if (isLoadingCourses && !activeCourse) {
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

  if (!activeCourse) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select an active course to view messages and draft new ones.
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
          View conversations and student replies, or compose a new message for{" "}
          {activeCourse.displayName}.
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
          <MessageInboxPanel courseId={activeCourse.localId} />
        </TabsContent>
        <TabsContent value="compose" className="mt-4 space-y-6">
          <MessageDraftPageHeader />
          <MessageDraftPage
            key={draftSeedKey || "default-draft"}
            fetchOptions={activeFetchOptions ?? fallbackFetchOptions ?? undefined}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
