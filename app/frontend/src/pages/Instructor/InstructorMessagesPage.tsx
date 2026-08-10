import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { MessageInboxPanel } from "@/components/messages/MessageInboxPanel";
import {
  MessageDraftPage,
  MessageDraftPageHeader,
} from "@/components/messages/MessageDraftPage";
import { MessageSentPanel } from "@/components/messages/MessageSentPanel";
import { Button } from "@/components/ui/button";
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
import { AlertCircle, Loader2, PenSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

const RECIPIENT_LOAD_TIMEOUT_MS = 5000;

type MessagesTab = "inbox" | "announcements" | "sent" | "compose";

function parseMessagesTab(raw: string | null): MessagesTab {
  if (raw === "compose") {
    return "compose";
  }
  if (raw === "announcements" || raw === "sent" || raw === "inbox") {
    return raw;
  }
  return "inbox";
}

export function InstructorMessagesPage() {
  const { accessToken, user } = useAuth();
  const {
    activeCourse,
    availableCourses,
    isLoading: isLoadingCourses,
  } = useActiveCourse();
  const canvasUrl = useCanvasConnectionUrl();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [fetchOptions, setFetchOptions] =
    useState<FetchMessageDraftOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const aiDraft = (location.state as AiMessageDraftLocationState | null)
    ?.aiMessageDraft;
  // Seed compose from an AI handoff on first paint only. The URL-sync effect
  // below must not keep re-forcing compose while location.state.aiMessageDraft
  // remains — otherwise Cancel / Inbox / Sent snap back to compose (#1510).
  const [tab, setTab] = useState<MessagesTab>(() =>
    aiDraft ? "compose" : parseMessagesTab(searchParams.get("tab")),
  );
  const aiComposeSeededRef = useRef(false);

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
  const composeCourseLabel =
    composeCourse?.name ??
    (aiDraft?.courseId === undefined ? activeCourse?.displayName : undefined);
  const courseLabel = activeCourse?.displayName;
  const basePrompt = useMemo(
    () =>
      composeCourseLabel ?
        `Draft a message for students in ${composeCourseLabel}.`
      : "Draft a message for students in the active course.",
    [composeCourseLabel],
  );
  const announcementPrompt = useMemo(
    () =>
      activeCourse ?
        `Draft a course announcement for ${activeCourse.displayName}.`
      : "Draft a course announcement for the active course.",
    [activeCourse],
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
  const announcementFetchOptions = useMemo<FetchMessageDraftOptions | null>(
    () =>
      activeCourse ?
        {
          courseId: activeCourse.localId,
          prompt: announcementPrompt,
          templateId: "course-announcement",
          templateName: "Course Announcement",
          emptyRecipients: true,
          canvasUrl,
        }
      : null,
    [activeCourse, announcementPrompt, canvasUrl],
  );
  const courseNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const course of availableCourses) {
      map[course.id] =
        course.code?.trim() || course.name?.trim() || `Course ${course.id}`;
    }
    return map;
  }, [availableCourses]);
  const draftSeedKey = [
    aiDraft?.subject ?? "",
    aiDraft?.body ?? "",
    aiDraft?.prompt ?? "",
    aiDraft?.conversationId ?? "",
    (aiDraft?.recipientIds ?? []).join(","),
  ].join("|");

  const handleTabChange = (value: string) => {
    const next = parseMessagesTab(value);
    setTab(next);
    // Preserve location.state: setSearchParams navigates without state by
    // default and would drop aiMessageDraft (losing the draft's courseId).
    if (next === "inbox") {
      setSearchParams({}, { replace: true, state: location.state });
    } else {
      setSearchParams({ tab: next }, { replace: true, state: location.state });
    }
  };

  useEffect(() => {
    const raw = searchParams.get("tab");
    // One-time handoff seed: write ?tab=compose so Cancel/Inbox (which clear
    // or change the URL) are not overridden by a sticky aiDraft flag.
    if (
      aiDraft &&
      !aiComposeSeededRef.current &&
      (raw == null || raw === "compose")
    ) {
      aiComposeSeededRef.current = true;
      if (raw !== "compose") {
        // Keep the handoff draft in location.state — without this, writing
        // ?tab=compose clears aiMessageDraft and compose falls back to the
        // active course (#1509 / Messages draft-course regressions).
        setSearchParams(
          { tab: "compose" },
          { replace: true, state: location.state },
        );
      }
      setTab("compose");
      return;
    }
    setTab(parseMessagesTab(raw));
  }, [aiDraft, location.state, searchParams, setSearchParams]);

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

  const composeContent =
    composeCourseId === undefined ? (
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
          onCancel={() => handleTabChange("inbox")}
        />
      </>
    );

  return (
    <div className="relative flex flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
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

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox & replies</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
        <TabsContent value="inbox" className="mt-4">
          <MessageInboxPanel
            courseId={activeCourse?.localId}
            courseLabel={courseLabel}
          />
        </TabsContent>
        <TabsContent value="announcements" className="mt-4 space-y-6">
          {!activeCourse ? (
            <Card className="shadow-sm ring-1 ring-border/60">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Select an active course to post a course announcement.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Course announcement
                </h2>
                <p className="text-sm text-muted-foreground">
                  Post to all students in {activeCourse.displayName}. This uses
                  Canvas announcements (not a private conversation).
                </p>
              </div>
              <MessageDraftPage
                key={`announcement-${activeCourse.localId}`}
                fetchOptions={announcementFetchOptions ?? undefined}
                onCancel={() => handleTabChange("inbox")}
              />
            </>
          )}
        </TabsContent>
        <TabsContent value="sent" className="mt-4">
          <MessageSentPanel
            courseId={activeCourse?.localId}
            courseLabel={courseLabel}
            courseNameById={courseNameById}
          />
        </TabsContent>
        <TabsContent value="compose" className="mt-4 space-y-6">
          {composeContent}
        </TabsContent>
      </Tabs>

      {tab !== "compose" ? (
        <Button
          type="button"
          size="lg"
          className="fixed bottom-6 right-6 z-40 h-14 gap-2 rounded-full px-5 shadow-lg"
          aria-label="Compose message"
          onClick={() => handleTabChange("compose")}
        >
          <PenSquare className="size-5" aria-hidden="true" />
          Compose
        </Button>
      ) : null}
    </div>
  );
}
