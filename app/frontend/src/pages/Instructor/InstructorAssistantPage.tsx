import { History, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AssistantLimitedModeBanner } from "@/components/chat/AssistantLimitedModeBanner";
import { DraftWorkspacePanel } from "@/components/chat/DraftWorkspacePanel";
import { ChatWindow, type ChatWindowHandle } from "@/components/chat/ChatWindow";
import { ActiveCourseContextBar } from "@/components/courses/ActiveCourseContextBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import {
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";
import { buildSuggestedActions } from "@/data/assistantSeedData";
import {
  clearStoredDeferredDraft,
  getStoredDeferredDraft,
} from "@/lib/deferred-assistant-storage";
import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";
import {
  buildTypedDraftResumeTarget,
  discardTypedDraft,
  listTypedDrafts,
  resolveTypedDraftCourseId,
  type TypedDraft,
} from "@/lib/typed-draft-storage";
import {
  fetchInstructorLlmProviders,
  resolveConnectedSettings,
  type InstructorLlmProvider,
} from "@/services/instructorLlmProviders";
import {
  AssistantApiError,
  cancelDeferredAssistantRequest,
  fetchConversation,
  listAssistantConversations,
  listDeferredAssistantRequests,
  resumeDeferredAssistantRequest,
  syncAssistantCourseContext,
  type ConversationResponse,
  type ConversationSummary,
  type DeferredAssistantRequest,
} from "@/services/assistant";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

interface InstructorAssistantLocationState {
  initialPrompt?: string;
  initialDraft?: string;
  initialConversationId?: number;
  initialPendingMessageId?: number;
}

function getLocationState(
  state: InstructorAssistantLocationState | null | undefined,
): InstructorAssistantLocationState {
  return state ?? {};
}

function formatConversationTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConversationPreview(preview: string | null): string {
  if (!preview) {
    return "No messages yet";
  }

  try {
    const parsed = JSON.parse(preview) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      const summary = record.summary ?? record.message ?? record.question ?? record.error;
      if (typeof summary === "string" && summary.trim()) {
        return summary;
      }
    }
  } catch {
    // Plain text rows are already display-ready.
  }

  return preview;
}

export function InstructorAssistantPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { activeCourse, availableCourses } = useActiveCourse();
  const suggestedActions = useMemo(
    () => buildSuggestedActions(activeCourse?.displayName),
    [activeCourse?.displayName],
  );
  const [locationState] = useState(() =>
    getLocationState(
      location.state as InstructorAssistantLocationState | null,
    ),
  );
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(
    () => locationState.initialPrompt ?? null,
  );
  const [pendingDraft, setPendingDraft] = useState<string | null>(
    () => locationState.initialDraft ?? null,
  );
  const [pendingConversationId, setPendingConversationId] = useState<
    number | undefined
  >(() => locationState.initialConversationId);
  const [pendingMessageId, setPendingMessageId] = useState<number | undefined>(
    () => locationState.initialPendingMessageId,
  );
  // Ticket 17 / #1441: show starter prompts only on an empty new chat.
  const [showStarterGuidance, setShowStarterGuidance] = useState(
    () =>
      !locationState.initialPrompt &&
      locationState.initialConversationId === undefined,
  );
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasPendingAssistantWork, setHasPendingAssistantWork] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LlmProviderSettings | null>(
    null,
  );
  const [llmProviders, setLlmProviders] = useState<InstructorLlmProvider[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversation, setSelectedConversation] =
    useState<ConversationResponse | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [loadingConversationId, setLoadingConversationId] = useState<
    number | null
  >(null);
  const [deferredRequests, setDeferredRequests] = useState<
    DeferredAssistantRequest[]
  >([]);
  const [deferredListLoaded, setDeferredListLoaded] = useState(false);
  const [isResumingDeferred, setIsResumingDeferred] = useState(false);
  const [pendingDeferredRequestId, setPendingDeferredRequestId] = useState<
    number | null
  >(null);
  const [discardingDeferredId, setDiscardingDeferredId] = useState<
    number | null
  >(null);
  const [typedDraftRevision, setTypedDraftRevision] = useState(0);
  const [discardingTypedId, setDiscardingTypedId] = useState<string | null>(
    null,
  );
  const chatWindowRef = useRef<ChatWindowHandle>(null);
  const conversationLoadRequestRef = useRef(0);
  const limitedMode = Boolean(user && !user.has_canvas_token);
  const typedDrafts = useMemo(() => {
    if (!user?.id) {
      return [] as TypedDraft[];
    }
    // typedDraftRevision is a cache buster after localStorage mutations.
    void typedDraftRevision;
    return listTypedDrafts(user.id);
  }, [user?.id, typedDraftRevision]);

  // The course each draft's Resume would open on, or undefined when nothing
  // can supply one. Resolution is per draft because resumability is per
  // draft: a draft carrying its own course needs no active course, while a
  // legacy one saved before labels existed needs exactly that. A panel-level
  // flag cannot express a list holding both — it either blocks the draft that
  // is fine or lets through the one that is not.
  //
  // handleResumeTypedDraft reads the same map, so the button's enabled state
  // and what resuming actually does cannot drift apart.
  const typedDraftCourseIds = useMemo(
    () =>
      new Map(
        typedDrafts.map((draft) => [
          draft.id,
          resolveTypedDraftCourseId(draft.content, availableCourses) ??
            activeCourse?.localId,
        ]),
      ),
    [activeCourse?.localId, availableCourses, typedDrafts],
  );

  const blockedTypedDraftIds = useMemo(
    () =>
      new Set(
        typedDrafts
          .filter((draft) => typedDraftCourseIds.get(draft.id) === undefined)
          .map((draft) => draft.id),
      ),
    [typedDraftCourseIds, typedDrafts],
  );

  const loadConversationList = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await listAssistantConversations(accessToken, {
        limit: 12,
      });
      setConversations(response.items);
    } catch (requestError) {
      setHistoryError(
        requestError instanceof AssistantApiError
          ? requestError.message
          : "Unable to load conversation history.",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, [accessToken]);

  const loadDeferredRequests = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await listDeferredAssistantRequests(accessToken);
      setDeferredRequests(response.items);
    } catch {
      // Banner still works without the count; chat remains usable.
    } finally {
      setDeferredListLoaded(true);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async history load on mount/auth changes
    void loadConversationList();
  }, [loadConversationList]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async deferred load on mount/auth changes
    void loadDeferredRequests();
  }, [loadDeferredRequests]);

  // Ticket 46 / #1507: as soon as the instructor picks a course here, write
  // the indexed course_context envelope so follow-ups use that selection
  // without waiting for the next typed message.
  useEffect(() => {
    if (!accessToken || !activeCourse?.localId) {
      return;
    }
    // When there is no pending conversation yet, wait for deferred-draft
    // hydration to finish before syncing without an explicit conversation
    // id. Otherwise this effect and the draft-restore effect (or
    // ChatWindow's own first send) can each call get_or_create_conversation
    // with no id around the same time and create two conversations.
    if (pendingConversationId === undefined && !deferredListLoaded) {
      return;
    }
    // Prefer a stored deferred draft's conversation id when sync would
    // otherwise create a brand-new conversation before the restore
    // timeout applies it (#1507 re-review).
    let conversationIdForSync = pendingConversationId;
    if (conversationIdForSync === undefined && user?.id) {
      const storedDraft = getStoredDeferredDraft(user.id);
      if (storedDraft?.conversationId !== undefined) {
        conversationIdForSync = storedDraft.conversationId;
      }
    }
    let cancelled = false;
    void syncAssistantCourseContext(accessToken, {
      localCourseId: activeCourse.localId,
      conversationId: conversationIdForSync,
    })
      .then((result) => {
        if (cancelled) return;
        // Course switches on an existing thread fork onto a different
        // conversation server-side (get_or_create_conversation), so the
        // returned id must always be adopted when it differs — not only
        // when nothing was pending — or ChatWindow keeps posting to the
        // old conversation while the synced envelope lives on the fork.
        // Clear loaded history + remount chat: ChatWindow skips hydrating
        // from initialConversationId while loadedConversation is set.
        if (result.conversationId !== pendingConversationId) {
          setPendingConversationId(result.conversationId);
          setSelectedConversation(null);
          setChatSessionKey((key) => key + 1);
        }
      })
      .catch(() => {
        // Soft failure — the next chat turn still seeds the envelope.
      });
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeCourse?.localId,
    pendingConversationId,
    deferredListLoaded,
    user?.id,
  ]);

  useEffect(() => {
    if (!accessToken || !user) return;
    let cancelled = false;
    void fetchInstructorLlmProviders(accessToken)
      .then((policy) => {
        if (cancelled) return;
        const resolved = resolveConnectedSettings(
          policy,
          getStoredLlmProviderSettings(user.id),
        );
        setLlmProviders(policy.providers);
        setLlmSettings(resolved);
        setStoredLlmProviderSettings(user.id, resolved);
      })
      .catch(() => {
        // The chat remains usable with the server default if policy metadata
        // cannot be loaded; the picker simply stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, user]);

  // After Canvas is connected, restore any locally cached deferred draft into
  // the composer only when the server queue is empty. The server queue is the
  // source of truth once requests are deferred — restoring a local draft while
  // the same request is still queued would duplicate it.
  useEffect(() => {
    if (!user?.has_canvas_token || !user.id || !deferredListLoaded) return;
    const draft = getStoredDeferredDraft(user.id);
    if (!draft?.message) return;
    clearStoredDeferredDraft(user.id);
    if (deferredRequests.length > 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPendingDraft(draft.message);
      if (draft.conversationId !== undefined) {
        setPendingConversationId(draft.conversationId);
      }
      if (draft.deferredRequestId != null) {
        setPendingDeferredRequestId(draft.deferredRequestId);
      }
      setChatSessionKey((current) => current + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    deferredListLoaded,
    deferredRequests.length,
    user?.has_canvas_token,
    user?.id,
  ]);

  const handleModelProviderChange = useCallback(
    (providerId: LlmProviderId) => {
      const provider = llmProviders.find((item) => item.id === providerId);
      if (!provider?.connected || !user) return;
      const next = {
        provider: provider.id,
        model: provider.saved_model ?? provider.models[0] ?? provider.default_model,
        baseUrl: provider.saved_base_url ?? "",
      };
      setLlmSettings(next);
      setStoredLlmProviderSettings(user.id, next);
    },
    [llmProviders, user],
  );

  const handleSuggestedAction = (prompt: string) => {
    setSelectedConversation(null);
    setShowStarterGuidance(false);
    chatWindowRef.current?.sendPrompt(prompt);
  };

  const handleStartNewChat = () => {
    setSelectedConversation(null);
    setPendingDraft(null);
    setPendingPrompt(null);
    setPendingConversationId(undefined);
    setPendingMessageId(undefined);
    setPendingDeferredRequestId(null);
    setHistoryError(null);
    setShowStarterGuidance(true);
    setChatSessionKey((current) => current + 1);
  };

  const handleLoadConversation = async (conversationId: number) => {
    if (!accessToken) {
      return;
    }

    const requestId = conversationLoadRequestRef.current + 1;
    conversationLoadRequestRef.current = requestId;
    setLoadingConversationId(conversationId);
    setHistoryError(null);

    try {
      const conversation = await fetchConversation(accessToken, conversationId);
      if (conversationLoadRequestRef.current !== requestId) {
        return;
      }
      setSelectedConversation(conversation);
      setPendingDraft(null);
      setPendingPrompt(null);
      setPendingDeferredRequestId(null);
      setPendingConversationId(conversation.id);
      setPendingMessageId(undefined);
      setShowStarterGuidance(false);
      setChatSessionKey((current) => current + 1);
    } catch (requestError) {
      if (conversationLoadRequestRef.current !== requestId) {
        return;
      }
      setHistoryError(
        requestError instanceof AssistantApiError
          ? requestError.message
          : "Unable to load this conversation.",
      );
    } finally {
      if (conversationLoadRequestRef.current === requestId) {
        setLoadingConversationId(null);
      }
    }
  };

  const handleConversationChange = (conversationId: number) => {
    setPendingConversationId(conversationId);
    void loadConversationList();
  };

  const handleResumeDeferred = async (deferredId?: number) => {
    if (!accessToken || deferredRequests.length === 0) {
      return;
    }

    const targetId = deferredId ?? deferredRequests[0]?.id;
    if (targetId == null) {
      return;
    }

    setIsResumingDeferred(true);
    try {
      const resumed = await resumeDeferredAssistantRequest(accessToken, targetId);
      setPendingPrompt(resumed.message);
      setPendingDeferredRequestId(resumed.id);
      if (resumed.conversation_id != null) {
        setPendingConversationId(resumed.conversation_id);
      }
      setSelectedConversation(null);
      // Hide starters here — don't wait for ChatWindow's initialPrompt auto-send
      // (which skips when resumed.message is empty/falsy).
      setShowStarterGuidance(false);
      setChatSessionKey((current) => current + 1);
      if (user) {
        clearStoredDeferredDraft(user.id);
      }
    } catch (requestError) {
      setHistoryError(
        requestError instanceof AssistantApiError
          ? requestError.message
          : "Unable to resume the saved request. Connect Canvas and try again.",
      );
    } finally {
      setIsResumingDeferred(false);
    }
  };

  const handleDiscardDeferred = async (deferredId: number) => {
    if (!accessToken) {
      return;
    }

    setDiscardingDeferredId(deferredId);
    setHistoryError(null);
    try {
      await cancelDeferredAssistantRequest(accessToken, deferredId);
      if (pendingDeferredRequestId === deferredId) {
        setPendingDeferredRequestId(null);
      }
      await loadDeferredRequests();
    } catch (requestError) {
      setHistoryError(
        requestError instanceof AssistantApiError
          ? requestError.message
          : "Unable to discard this saved request.",
      );
    } finally {
      setDiscardingDeferredId(null);
    }
  };

  const handleResumeTypedDraft = (draftId: string) => {
    if (!user?.id) return;
    const draft = typedDrafts.find((entry) => entry.id === draftId);
    if (!draft) return;
    // The draft's own course wins over whatever happens to be active now.
    // Resuming used to seed the active course unconditionally, so switching
    // courses between save and resume silently retargeted the draft at the
    // new one. The active course is the fallback only when the draft predates
    // this (no labels stored) or its course is no longer in the list.
    // typedDraftCourseIds holds that resolution; the panel disables Resume for
    // the drafts it cannot answer, so reaching this guard is defensive only.
    const courseId = typedDraftCourseIds.get(draftId);
    if (courseId === undefined) return;
    // Keep the draft until Canvas confirm/submit on the target create page.
    const target = buildTypedDraftResumeTarget(draft, { courseId });
    navigate(target.path, { state: target.state });
  };

  const handleDiscardTypedDraft = (draftId: string) => {
    if (!user?.id) return;
    setDiscardingTypedId(draftId);
    discardTypedDraft(user.id, draftId);
    setTypedDraftRevision((current) => current + 1);
    setDiscardingTypedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4 md:p-5 lg:p-6">
      {limitedMode ? (
        <AssistantLimitedModeBanner deferredCount={deferredRequests.length} />
      ) : deferredRequests.length > 0 ? (
        <AssistantLimitedModeBanner
          resumeOnly
          deferredCount={deferredRequests.length}
          onResumeNext={() => void handleResumeDeferred()}
          isResuming={isResumingDeferred}
        />
      ) : null}

      {deferredRequests.length > 0 || typedDrafts.length > 0 ? (
        <DraftWorkspacePanel
          items={deferredRequests}
          typedDrafts={typedDrafts}
          onResume={(deferredId) => void handleResumeDeferred(deferredId)}
          onDiscard={(deferredId) => void handleDiscardDeferred(deferredId)}
          onResumeTypedDraft={handleResumeTypedDraft}
          onDiscardTypedDraft={handleDiscardTypedDraft}
          isResuming={isResumingDeferred}
          discardingId={discardingDeferredId}
          discardingTypedId={discardingTypedId}
          blockedTypedDraftIds={blockedTypedDraftIds}
        />
      ) : null}

      {user?.has_canvas_token ? (
        <ActiveCourseContextBar
          hasPendingAssistantWork={() => hasPendingAssistantWork}
        />
      ) : null}

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
        visible={showStarterGuidance}
      />

      {/* The chat is the primary surface: it takes every pixel the collapsed
          panels above don't need (min-h-0 + flex-1), and all scrolling happens
          inside it (or inside the history sidebar) rather than on the page
          frame, so the input never scrolls out of reach (#1, #10). */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ChatWindow
          ref={chatWindowRef}
          key={chatSessionKey}
          initialPrompt={pendingPrompt}
          initialDraft={pendingDraft}
          initialConversationId={pendingConversationId}
          initialPendingMessageId={pendingMessageId}
          initialDeferredRequestId={pendingDeferredRequestId}
          loadedConversation={selectedConversation}
          onInitialPromptConsumed={() => setPendingPrompt(null)}
          onModifyContextConsumed={() => {
            setPendingDraft(null);
            setPendingConversationId(undefined);
            setPendingMessageId(undefined);
          }}
          onConversationChange={handleConversationChange}
          onDeferredRequest={() => void loadDeferredRequests()}
          onDeferredResumeComplete={() => {
            setPendingDeferredRequestId(null);
            void loadDeferredRequests();
          }}
          onLoadingChange={setIsLoading}
          onConversationStarted={() => setShowStarterGuidance(false)}
          onPendingWorkChange={setHasPendingAssistantWork}
          onStartNewChat={handleStartNewChat}
          modelSettings={llmSettings}
          llmProviders={llmProviders}
          onModelProviderChange={handleModelProviderChange}
        />

        <section
          aria-labelledby="assistant-history-heading"
          className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background p-2.5 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <History className="size-4 shrink-0 text-muted-foreground" />
              <h2
                id="assistant-history-heading"
                className="truncate text-sm font-semibold text-foreground"
              >
                Conversation History
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => void loadConversationList()}
              disabled={isHistoryLoading}
              aria-label="Refresh conversation history"
              title="Refresh conversation history"
            >
              {isHistoryLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
            </Button>
          </div>

          {historyError ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {historyError}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {conversations.length === 0 && !isHistoryLoading ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                Previous assistant conversations will appear here.
              </p>
            ) : null}

            {conversations.map((conversation) => {
              const isSelected =
                selectedConversation?.id === conversation.id ||
                pendingConversationId === conversation.id;
              const isLoadingConversation =
                loadingConversationId === conversation.id;

              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void handleLoadConversation(conversation.id)}
                  disabled={isLoadingConversation}
                  className={[
                    "w-full rounded-lg border px-3 py-2.5 text-left transition",
                    "hover:border-blue-500/40 hover:bg-blue-500/5",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-blue-500/50 bg-blue-500/10"
                      : "border-border/70 bg-muted/20",
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{formatConversationTime(conversation.updated_at)}</span>
                    {conversation.pending_action_count > 0 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                        Pending
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 line-clamp-2 block text-[13px] font-medium leading-snug text-foreground">
                    {isLoadingConversation
                      ? "Loading conversation..."
                      : formatConversationPreview(conversation.preview)}
                  </span>
                  <span className="mt-1 block text-xs leading-none text-muted-foreground">
                    {conversation.message_count} messages
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
