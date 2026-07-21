import { History, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { AssistantLimitedModeBanner } from "@/components/chat/AssistantLimitedModeBanner";
import { ChatWindow, type ChatWindowHandle } from "@/components/chat/ChatWindow";
import { ActiveCourseContextBar } from "@/components/courses/ActiveCourseContextBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import {
  InstructorAssistantHeader,
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
  fetchInstructorLlmProviders,
  resolveConnectedSettings,
  type InstructorLlmProvider,
} from "@/services/instructorLlmProviders";
import {
  AssistantApiError,
  fetchConversation,
  listAssistantConversations,
  listDeferredAssistantRequests,
  resumeDeferredAssistantRequest,
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
  const { accessToken, user } = useAuth();
  const { activeCourse } = useActiveCourse();
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
  const [chatSessionKey, setChatSessionKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
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
  const [isResumingDeferred, setIsResumingDeferred] = useState(false);
  const chatWindowRef = useRef<ChatWindowHandle>(null);
  const limitedMode = Boolean(user && !user.has_canvas_token);

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
  // the composer so the instructor can resume without retyping. Schedule
  // setState asynchronously — synchronous setState in an effect body trips
  // react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!user?.has_canvas_token) return;
    const draft = getStoredDeferredDraft(user.id);
    if (!draft?.message) return;
    clearStoredDeferredDraft(user.id);
    const timer = window.setTimeout(() => {
      setPendingDraft(draft.message);
      if (draft.conversationId !== undefined) {
        setPendingConversationId(draft.conversationId);
      }
      setChatSessionKey((current) => current + 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [user?.has_canvas_token, user?.id]);

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
    chatWindowRef.current?.sendPrompt(prompt);
  };

  const handleStartNewChat = () => {
    setSelectedConversation(null);
    setPendingDraft(null);
    setPendingPrompt(null);
    setPendingConversationId(undefined);
    setPendingMessageId(undefined);
    setHistoryError(null);
    setChatSessionKey((current) => current + 1);
  };

  const handleLoadConversation = async (conversationId: number) => {
    if (!accessToken) {
      return;
    }

    setLoadingConversationId(conversationId);
    setHistoryError(null);

    try {
      const conversation = await fetchConversation(accessToken, conversationId);
      setSelectedConversation(conversation);
      setPendingDraft(null);
      setPendingPrompt(null);
      setPendingConversationId(conversation.id);
      setPendingMessageId(undefined);
      setChatSessionKey((current) => current + 1);
    } catch (requestError) {
      setHistoryError(
        requestError instanceof AssistantApiError
          ? requestError.message
          : "Unable to load this conversation.",
      );
    } finally {
      setLoadingConversationId(null);
    }
  };

  const handleConversationChange = (conversationId: number) => {
    setPendingConversationId(conversationId);
    void loadConversationList();
  };

  const handleResumeDeferred = async () => {
    if (!accessToken || deferredRequests.length === 0) {
      return;
    }

    setIsResumingDeferred(true);
    try {
      const [first, ...rest] = deferredRequests;
      const resumed = await resumeDeferredAssistantRequest(accessToken, first.id);
      setPendingPrompt(resumed.message);
      if (resumed.conversation_id != null) {
        setPendingConversationId(resumed.conversation_id);
      }
      setSelectedConversation(null);
      setChatSessionKey((current) => current + 1);
      setDeferredRequests(rest);
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

  return (
    <div className="flex min-h-full flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-5 lg:p-6">
      <InstructorAssistantHeader />

      {limitedMode ? (
        <AssistantLimitedModeBanner deferredCount={deferredRequests.length} />
      ) : deferredRequests.length > 0 ? (
        <AssistantLimitedModeBanner
          resumeOnly
          deferredCount={deferredRequests.length}
          onResumeAll={() => void handleResumeDeferred()}
          isResuming={isResumingDeferred}
        />
      ) : null}

      {user?.has_canvas_token ? <ActiveCourseContextBar /> : null}

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
      />

      <div className="grid min-h-[38rem] gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <ChatWindow
          ref={chatWindowRef}
          key={chatSessionKey}
          initialPrompt={pendingPrompt}
          initialDraft={pendingDraft}
          initialConversationId={pendingConversationId}
          initialPendingMessageId={pendingMessageId}
          loadedConversation={selectedConversation}
          onInitialPromptConsumed={() => setPendingPrompt(null)}
          onModifyContextConsumed={() => {
            setPendingDraft(null);
            setPendingConversationId(undefined);
            setPendingMessageId(undefined);
          }}
          onConversationChange={handleConversationChange}
          onDeferredRequest={() => void loadDeferredRequests()}
          onLoadingChange={setIsLoading}
          onStartNewChat={handleStartNewChat}
          modelSettings={llmSettings}
          llmProviders={llmProviders}
          onModelProviderChange={handleModelProviderChange}
        />

        <section
          aria-labelledby="assistant-history-heading"
          className="flex min-h-[24rem] flex-col rounded-lg border border-border/70 bg-background p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
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

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
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
                    "w-full rounded-lg border px-3 py-3 text-left transition",
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
                  <span className="mt-1 line-clamp-2 block text-sm font-medium text-foreground">
                    {isLoadingConversation
                      ? "Loading conversation..."
                      : formatConversationPreview(conversation.preview)}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
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
