import { Plus } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { LoadingIndicator } from "@/components/chat/LoadingIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { seedChatMessages } from "@/data/assistantSeedData";
import { isAbortError } from "@/lib/api-request";
import {
  ASSISTANT_LOADING_COPY,
  LOADING_NOTE_AFTER_MS,
  LOADING_STAGE_ADVANCE_MS,
  LONG_WAIT_NOTE,
  inferAssistantLoadingStage,
  nextAssistantLoadingStage,
  type AssistantLoadingStage,
} from "@/lib/assistant-loading-stage";
import { isCancellationPhrase } from "@/lib/chat-cancellation";
import { setStoredDeferredDraft } from "@/lib/deferred-assistant-storage";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  mapConversationToChatMessages,
  pauseAssistantAction,
  renameAssistantAction,
  resumeAssistantAction,
  sendAssistantMessage,
  type ConversationResponse,
} from "@/services/assistant";
import type { AssistantMessageResult } from "@/services/assistant";
import {
  reverseWorkflow,
  WorkflowHistoryApiError,
} from "@/services/workflowHistory";
import type { InstructorLlmProvider } from "@/services/instructorLlmProviders";
import type { ChatMessage } from "@/types/chat";
import { mapWorkflowStatus } from "@/types/chat";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

const SCROLL_STICK_THRESHOLD_PX = 100;
function createMessageId(): string {
  return crypto.randomUUID();
}

// A stored assistant message's content is either the full JSON envelope
// the backend returned (for structured replies like intent_preview or a
// tool result — see mapChatReplyToAssistantResponse) or a plain string
// (a plain-text model reply, or an error message logged verbatim). Only
// the former needs remapping on reload; the latter is displayed as-is.
function parseStoredAssistantReply(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function withWelcomeMessage(restoredMessages: ChatMessage[]): ChatMessage[] {
  if (restoredMessages.length === 0) {
    return seedChatMessages;
  }

  return [
    ...seedChatMessages,
    ...restoredMessages.filter((message) => message.id !== "welcome"),
  ];
}

function isExplicitPreviewModification(message: string): boolean {
  // Free-typed questions should not accidentally revise a pending Canvas
  // write. Keep modification mode opt-in while allowing natural draft edits
  // and explicit confirmation/cancellation language.
  return /\b(change|revise|edit|update|modify|replace|add|remove|set|make|use|instead|actually|cancel|discard|approve|confirm)\b/i.test(
    message,
  );
}

interface InitialChatState {
  messages: ChatMessage[];
  conversationId?: number;
  hydratedConversationId?: number;
}

function getInitialChatState({
  initialConversationId,
  loadedConversation,
}: Pick<
  ChatWindowProps,
  "initialConversationId" | "loadedConversation"
>): InitialChatState {
  if (!loadedConversation) {
    return {
      messages: seedChatMessages,
      conversationId: initialConversationId,
    };
  }

  const loadedMessages = mapConversationToChatMessages(loadedConversation);

  return {
    messages: withWelcomeMessage(loadedMessages),
    conversationId: loadedConversation.id,
    hydratedConversationId: loadedConversation.id,
  };
}

interface ChatWindowProps {
  initialPrompt?: string | null;
  initialDraft?: string | null;
  initialConversationId?: number;
  initialPendingMessageId?: number;
  initialDeferredRequestId?: number | null;
  loadedConversation?: ConversationResponse | null;
  onInitialPromptConsumed?: () => void;
  onModifyContextConsumed?: () => void;
  onConversationChange?: (conversationId: number) => void;
  /** The course this turn resolved to, when the backend named one. Differs
   * from the selected course exactly when the instructor named a course in
   * the message; the assistant page moves the chat tab to match. */
  onResolvedCourse?: (course: {
    localCourseId: number;
    courseName?: string;
    conversationId?: number;
  }) => void;
  onDeferredRequest?: () => void;
  onDeferredResumeComplete?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
  /** True while a reply is streaming or a preview awaits confirm/cancel. */
  onPendingWorkChange?: (hasPendingWork: boolean) => void;
  /** Fires once a valid user message is accepted (typed or starter prompt). */
  onConversationStarted?: () => void;
  onStartNewChat?: () => void;
  modelSettings?: LlmProviderSettings | null;
  llmProviders?: InstructorLlmProvider[];
  onModelProviderChange?: (providerId: LlmProviderId) => void;
}

export interface ChatWindowHandle {
  sendPrompt: (prompt: string) => void;
}

export const ChatWindow = forwardRef<ChatWindowHandle, ChatWindowProps>(function ChatWindow({
  initialPrompt = null,
  initialDraft = null,
  initialConversationId,
  initialPendingMessageId,
  initialDeferredRequestId = null,
  loadedConversation = null,
  onInitialPromptConsumed,
  onModifyContextConsumed,
  onConversationChange,
  onResolvedCourse,
  onDeferredRequest,
  onDeferredResumeComplete,
  onLoadingChange,
  onPendingWorkChange,
  onConversationStarted,
  onStartNewChat,
  modelSettings = null,
  llmProviders = [],
  onModelProviderChange,
}, ref) {
  const navigate = useNavigate();
  const { accessToken, user } = useAuth();
  const { activeCourse, refreshActiveCourse, notifyCoursesChanged } =
    useActiveCourse();
  const { refreshDashboard } = useInstitution();
  const initialChatState = useMemo(
    () =>
      getInitialChatState({
        initialConversationId,
        loadedConversation,
      }),
    [initialConversationId, loadedConversation],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialChatState.messages,
  );
  const [conversationId, setConversationId] = useState<number | undefined>(
    () => initialChatState.conversationId,
  );
  // A grouped send_message turn can resolve to more than one distinct
  // message, each independently confirmable/cancelable — so more than one
  // preview can be simultaneously pending, not just the single most recent
  // one. See additionalPreviews on AssistantResponse.
  const [activePendingMessageIds, setActivePendingMessageIds] = useState<
    number[]
  >(() => {
    // A loadedConversation can already carry more than one still-pending
    // preview (e.g. a grouped send_message batch) — derive the full set
    // from its messages rather than only trusting the single
    // initialPendingMessageId prop, which only ever names one specific
    // preview (e.g. the one a "review preview" deep link pointed at).
    const pendingFromMessages = initialChatState.messages
      .filter((entry) => entry.pendingActionStatus === "pending")
      .map((entry) => entry.pendingMessageId)
      .filter((id): id is number => id !== undefined);

    if (pendingFromMessages.length > 0) {
      return pendingFromMessages;
    }

    return initialPendingMessageId !== undefined ? [initialPendingMessageId] : [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] =
    useState<AssistantLoadingStage>("thinking");
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(
    null,
  );
  const [pendingActionError, setPendingActionError] = useState<string | null>(
    null,
  );
  // Kept separately from resolvingMessageId so errors remain visible after
  // the request settles (finally clears the loading id).
  const [pendingActionErrorMessageId, setPendingActionErrorMessageId] =
    useState<string | null>(null);
  const [reversingWorkflowId, setReversingWorkflowId] = useState<number | null>(null);
  const [reversedWorkflowIds, setReversedWorkflowIds] = useState<Set<number>>(
    () => new Set(),
  );
  const messageListRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const initialPromptHandledRef = useRef<string | null>(null);
  const hydratedConversationRef = useRef<number | undefined>(
    initialChatState.hydratedConversationId,
  );
  const isDeliveringRef = useRef(false);
  const deferredRequestIdRef = useRef<number | null>(
    initialDeferredRequestId ?? null,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const loadingTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearLoadingFeedback = useCallback(() => {
    for (const timerId of loadingTimersRef.current) {
      clearTimeout(timerId);
    }
    loadingTimersRef.current = [];
    setLoadingNote(null);
    setLoadingStage("thinking");
  }, []);

  const startLoadingFeedback = useCallback(
    (userText: string) => {
      clearLoadingFeedback();
      const initialStage = inferAssistantLoadingStage(userText);
      setLoadingStage(initialStage);
      setLoadingNote(null);
      loadingTimersRef.current = [
        setTimeout(() => {
          setLoadingStage((current) => nextAssistantLoadingStage(current));
        }, LOADING_STAGE_ADVANCE_MS),
        setTimeout(() => {
          setLoadingNote(LONG_WAIT_NOTE);
        }, LOADING_NOTE_AFTER_MS),
      ];
    },
    [clearLoadingFeedback],
  );

  // Clear stage timers on unmount so a mid-flight navigate cannot call
  // setLoadingStage / setLoadingNote after this component is gone.
  useEffect(() => {
    return () => {
      for (const timerId of loadingTimersRef.current) {
        clearTimeout(timerId);
      }
      loadingTimersRef.current = [];
    };
  }, []);

  const assistantContext = useMemo(
    () => ({
      activeCourseLabel: activeCourse?.displayName,
      activeCourseId: activeCourse?.localId,
    }),
    [activeCourse?.displayName, activeCourse?.localId],
  );

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    const updateStickToBottom = () => {
      const distanceFromBottom =
        messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight;
      stickToBottomRef.current = distanceFromBottom <= SCROLL_STICK_THRESHOLD_PX;
    };

    updateStickToBottom();
    messageList.addEventListener("scroll", updateStickToBottom);
    return () => messageList.removeEventListener("scroll", updateStickToBottom);
  }, []);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList || !stickToBottomRef.current) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
  }, [messages, isLoading, error]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    onPendingWorkChange?.(
      isLoading || activePendingMessageIds.length > 0,
    );
  }, [isLoading, activePendingMessageIds, onPendingWorkChange]);

  useEffect(() => {
    if (
      !accessToken ||
      loadedConversation ||
      initialConversationId === undefined ||
      hydratedConversationRef.current === initialConversationId
    ) {
      return;
    }

    let cancelled = false;

    async function hydrateConversation() {
      try {
        const conversation = await fetchConversation(
          accessToken!,
          initialConversationId!,
        );
        if (cancelled) {
          return;
        }

        // Authoritative per-preview status, keyed by preview_message_id —
        // see WorkflowStatus in app/backend/app/schemas/chat.py. Replaces
        // the old FIFO reconstruction (matching "[confirmed action]"/
        // "[cancelled action]" marker text to the oldest still-open
        // preview in transcript order), which mislabeled cards whenever
        // more than one preview existed and they were resolved out of
        // order. Live, in-session confirm/cancel (resolvePendingAction)
        // was always unaffected by that bug — it matches by exact message
        // id — this only fixes the post-reload reconstruction.
        const workflowStatuses = conversation.workflow_statuses ?? {};

        const restoredMessages = conversation.messages.flatMap<ChatMessage>((storedMessage) => {
          const timestamp = new Date(storedMessage.created_at);

          if (storedMessage.role === "user") {
            if (storedMessage.content.startsWith("[")) {
              return [];
            }

            return [{
              id: String(storedMessage.id),
              role: "user",
              content: storedMessage.content,
              timestamp,
              conversationId: conversation.id,
            }];
          }

          const parsed = parseStoredAssistantReply(storedMessage.content);
          if (!parsed) {
            return [{
              id: String(storedMessage.id),
              role: "assistant",
              content: storedMessage.content,
              timestamp,
              conversationId: conversation.id,
            }];
          }

          const reply = parsed.intent_preview && parsed.pending_message_id === undefined
            ? { ...parsed, pending_message_id: storedMessage.id }
            : parsed;
          const mapped = mapChatReplyToAssistantResponse(reply, false, conversation.id);

          return [{
            id: String(storedMessage.id),
            role: "assistant",
            content: mapped.content,
            timestamp,
            conversationId: conversation.id,
            pendingMessageId: mapped.pendingMessageId,
            workflowId: mapped.pendingMessageId
              ? workflowStatuses[mapped.pendingMessageId]?.workflow_id
              : undefined,
            pendingActionStatus: mapped.pendingMessageId
              ? mapWorkflowStatus(workflowStatuses[mapped.pendingMessageId]?.status)
              : undefined,
            workflowDisplayName: mapped.pendingMessageId
              ? workflowStatuses[mapped.pendingMessageId]?.display_name ?? null
              : undefined,
            explanation: mapped.explanation,
            acknowledgedFields: mapped.acknowledgedFields,
            interpretedAction: mapped.interpretedAction,
            safetyBlocked: mapped.safetyBlocked,
            safetyMessage: mapped.safetyMessage,
            requiresCanvasToken: mapped.requiresCanvasToken,
            deferredRequestId: mapped.deferredRequestId,
            unverifiedClaims: mapped.unverifiedClaims,
          }];
        });

        const nextActivePendingMessageIds = restoredMessages
          .filter((entry) => entry.pendingActionStatus === "pending")
          .map((entry) => entry.pendingMessageId)
          .filter((id): id is number => id !== undefined);

        setMessages(withWelcomeMessage(restoredMessages));
        setConversationId(conversation.id);
        setActivePendingMessageIds(nextActivePendingMessageIds);
        hydratedConversationRef.current = initialConversationId;
      } catch {
        if (cancelled) {
          return;
        }

        // Keep the seeded assistant greeting if restoring history fails; the
        // next send still continues in the existing conversation id.
        setConversationId(initialConversationId);
        setActivePendingMessageIds(
          initialPendingMessageId !== undefined ? [initialPendingMessageId] : [],
        );
      }
    }

    void hydrateConversation();

    return () => {
      cancelled = true;
    };
  }, [accessToken, initialConversationId, initialPendingMessageId, loadedConversation]);

  const appendAssistantMessage = useCallback(
    (response: AssistantMessageResult) => {
      // Quiz creation stays in chat so the instructor can review the draft
      // and explicitly open the dedicated form. Other form handoffs retain
      // their existing automatic navigation behavior.
      if (
        response.navigateTo &&
        response.interpretedAction?.action !== "Create Quiz"
      ) {
        const briefMsg: ChatMessage = {
          id: createMessageId(),
          role: "assistant",
          content: response.content,
          timestamp: new Date(),
          conversationId: response.conversationId,
          explanation: response.explanation,
          interpretedAction: response.interpretedAction,
        };
        setMessages((current) => [...current, briefMsg]);
        navigate(response.navigateTo.path, { state: response.navigateTo.state });
        return;
      }

      // A grouped send_message turn can resolve to more than one distinct
      // message — the primary response plus every entry in
      // additionalPreviews all become their own message row, each
      // independently confirmable/cancelable.
      const allResponses = [response, ...(response.additionalPreviews ?? [])];

      const newMessages: ChatMessage[] = allResponses.map((entry) => ({
        id: createMessageId(),
        role: "assistant",
        content: entry.content,
        timestamp: new Date(),
        conversationId: entry.conversationId ?? response.conversationId,
        pendingMessageId: entry.pendingMessageId,
        workflowId: undefined,
        pendingActionStatus: entry.pendingMessageId ? "pending" : undefined,
        explanation: entry.explanation,
        acknowledgedFields: entry.acknowledgedFields,
        interpretedAction: entry.interpretedAction,
        safetyBlocked: entry.safetyBlocked,
        safetyMessage: entry.safetyMessage,
        requiresCanvasToken: entry.requiresCanvasToken,
        deferredRequestId: entry.deferredRequestId,
        unverifiedClaims: entry.unverifiedClaims,
      }));

      setMessages((current) => [...current, ...newMessages]);

      const newPendingIds = newMessages
        .map((entry) => entry.pendingMessageId)
        .filter((id): id is number => id !== undefined);
      if (newPendingIds.length > 0) {
        setActivePendingMessageIds((current) => [...current, ...newPendingIds]);
      }
    },
    [navigate],
  );

  const deliverAssistantResponse = useCallback(
    async (userText: string) => {
      if (isDeliveringRef.current) {
        return;
      }

      if (!accessToken) {
        setError("You must be signed in to use the assistant.");
        return;
      }

      isDeliveringRef.current = true;
      setIsLoading(true);
      startLoadingFeedback(userText);
      setError(null);
      setRetryMessage(userText);

      // Only target a specific preview for modification when exactly one is
      // currently pending — with more than one open at once (a grouped
      // send_message batch), which one a free-typed follow-up should modify
      // is ambiguous, so it starts a fresh normal turn instead. A future
      // auto-advancing queue (only ever surfacing one preview at a time)
      // removes this limitation.
      const pendingMessageIdToSend =
        activePendingMessageIds.length === 1 && isExplicitPreviewModification(userText)
          ? activePendingMessageIds[0]
          : undefined;

      // Client-side abort only: cancels the browser fetch so the UI can show
      // "Stopped." There is no server-side cancel endpoint — the backend
      // assistant turn may still finish and persist. That is intentional for
      // Phase 5 (soft stop UX), not a true cancel of Canvas/LLM work.
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await sendAssistantMessage(accessToken, userText, {
          context: assistantContext,
          conversationId,
          // Seed only a brand-new conversation from the visible course
          // selector. Existing conversations remain bound to their own
          // server-validated course and cannot be overridden implicitly.
          localCourseId: conversationId === undefined ? activeCourse?.localId : undefined,
          pendingMessageId: pendingMessageIdToSend,
          deferredRequestId: deferredRequestIdRef.current ?? undefined,
          modelSettings: modelSettings ?? undefined,
          signal: abortController.signal,
        });

        if (pendingMessageIdToSend !== undefined) {
          setMessages((current) =>
            current.map((entry) =>
              entry.pendingMessageId === pendingMessageIdToSend &&
              entry.pendingActionStatus === "pending"
                ? { ...entry, pendingActionStatus: "superseded" }
                : entry,
            ),
          );
          setActivePendingMessageIds((current) =>
            current.filter((id) => id !== pendingMessageIdToSend),
          );
          onModifyContextConsumed?.();
        }

        setConversationId(response.conversationId);
        onConversationChange?.(response.conversationId);
        if (response.resolvedCourse) {
          onResolvedCourse?.({
            ...response.resolvedCourse,
            conversationId: response.conversationId,
          });
        }
        if (response.requiresCanvasToken && user?.id) {
          setStoredDeferredDraft(user.id, {
            message: userText,
            conversationId: response.conversationId,
            deferredRequestId: response.deferredRequestId,
          });
          onDeferredRequest?.();
        } else if (deferredRequestIdRef.current != null) {
          deferredRequestIdRef.current = null;
          onDeferredResumeComplete?.();
        }
        appendAssistantMessage(response);
        setRetryMessage(null);
      } catch (requestError) {
        if (isAbortError(requestError)) {
          setMessages((current) => [
            ...current,
            {
              id: createMessageId(),
              role: "assistant",
              content: "Stopped.",
              timestamp: new Date(),
              conversationId,
            },
          ]);
          setError(null);
          setRetryMessage(null);
        } else {
          const message =
            requestError instanceof AssistantApiError
              ? requestError.message
              : "Something went wrong. Please try again.";
          setError(message);
        }
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        isDeliveringRef.current = false;
        clearLoadingFeedback();
        setIsLoading(false);
      }
    },
    [
      accessToken,
      activeCourse?.localId,
      activePendingMessageIds,
      appendAssistantMessage,
      assistantContext,
      clearLoadingFeedback,
      conversationId,
      modelSettings,
      onConversationChange,
      onResolvedCourse,
      onDeferredRequest,
      onDeferredResumeComplete,
      startLoadingFeedback,
      onModifyContextConsumed,
      user?.id,
    ],
  );

  const resolvePendingAction = useCallback(
    async (
      message: ChatMessage,
      action: "confirm" | "cancel" | "pause" | "resume" | "rename",
      renameDisplayName?: string,
    ) => {
      if (!accessToken || message.pendingMessageId === undefined) {
        return;
      }

      const allowedStatuses =
        action === "resume" || action === "rename"
          ? new Set(["pending", "paused"])
          : new Set(["pending"]);
      if (
        !message.pendingActionStatus ||
        !allowedStatuses.has(message.pendingActionStatus)
      ) {
        return;
      }

      const activeConversationId = message.conversationId ?? conversationId;
      if (activeConversationId === undefined) {
        return;
      }

      if (
        action === "confirm" &&
        messages.some(
          (entry) =>
            entry.id !== message.id && entry.pendingActionStatus === "executing",
        )
      ) {
        setPendingActionError(
          "Another Canvas write is already running. Wait for it to finish, or pause/cancel it first.",
        );
        setPendingActionErrorMessageId(message.id);
        return;
      }

      setResolvingMessageId(message.id);
      setPendingActionError(null);
      setPendingActionErrorMessageId(null);

      try {
        if (action === "pause") {
          await pauseAssistantAction(
            accessToken,
            activeConversationId,
            message.pendingMessageId,
          );
          setActivePendingMessageIds((current) =>
            current.filter((id) => id !== message.pendingMessageId),
          );
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? { ...entry, pendingActionStatus: "paused" }
                : entry,
            ),
          );
          return;
        }

        if (action === "resume") {
          await resumeAssistantAction(
            accessToken,
            activeConversationId,
            message.pendingMessageId,
          );
          setActivePendingMessageIds((current) =>
            current.includes(message.pendingMessageId!)
              ? current
              : [...current, message.pendingMessageId!],
          );
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? { ...entry, pendingActionStatus: "pending" }
                : entry,
            ),
          );
          return;
        }

        if (action === "rename") {
          const nextName = renameDisplayName?.trim();
          if (!nextName) {
            setPendingActionError("Enter a workflow name before saving.");
            setPendingActionErrorMessageId(message.id);
            return;
          }
          await renameAssistantAction(
            accessToken,
            activeConversationId,
            message.pendingMessageId,
            nextName,
          );
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? { ...entry, workflowDisplayName: nextName }
                : entry,
            ),
          );
          return;
        }

        if (action === "confirm") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? { ...entry, pendingActionStatus: "executing" }
                : entry,
            ),
          );
        }

        const response =
          action === "confirm"
            ? await confirmAssistantAction(
                accessToken,
                activeConversationId,
                message.pendingMessageId,
              )
            : await cancelAssistantAction(
                accessToken,
                activeConversationId,
                message.pendingMessageId,
              );

        const confirmFailed = action === "confirm" && Boolean(response.isError);
        // Only resolve workflow_id after a successful confirm. A failed
        // confirm must still surface response.content and must not be
        // rewritten as a generic request error if conversation refresh fails.
        const confirmedWorkflowId =
          action === "confirm" && !confirmFailed
            ? (
                await fetchConversation(accessToken, activeConversationId)
              ).workflow_statuses[message.pendingMessageId]?.workflow_id
            : undefined;

        setConversationId(response.conversationId);
        setActivePendingMessageIds((current) =>
          current.filter((id) => id !== message.pendingMessageId),
        );
        setMessages((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? {
                  ...entry,
                  pendingActionStatus: confirmFailed
                    ? "failed"
                    : action === "confirm"
                      ? "confirmed"
                      : "cancelled",
                  workflowId:
                    action === "confirm" && !confirmFailed
                      ? confirmedWorkflowId
                      : entry.workflowId,
                  // Hide the offer cards after cancel so the proposal
                  // disappears entirely (no leftover explanation/action UI).
                  ...(action === "cancel"
                    ? {
                        handoffDismissed: true,
                        explanation: undefined,
                        interpretedAction: undefined,
                      }
                    : {}),
                }
              : entry,
          ),
        );
        appendAssistantMessage(response);

        if (action === "confirm" && !confirmFailed) {
          // The confirmed action just committed a write to Canvas/the local
          // DB — ActiveCourseProvider and InstitutionProvider are both
          // mounted once for the whole session, so nothing else will ask
          // them to re-fetch. Without this, course/assignment counts and
          // dashboard metrics stay stale until a full page reload.
          // Refresh failures must not rewrite a successful confirm as failed.
          try {
            void refreshActiveCourse();
            notifyCoursesChanged?.();
            void refreshDashboard();
          } catch {
            // Best-effort UI refresh only.
          }
        }
      } catch (requestError) {
        // Form-handoff leftovers have no Workflow row (404). Only those may
        // dismiss locally — real cancel/pause failures (e.g. 409 while paused)
        // must surface so the UI stays in sync with the server.
        if (
          action === "cancel" &&
          requestError instanceof AssistantApiError &&
          requestError.status === 404
        ) {
          setActivePendingMessageIds((current) =>
            current.filter((id) => id !== message.pendingMessageId),
          );
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    pendingActionStatus: "cancelled",
                    handoffDismissed: true,
                    explanation: undefined,
                    interpretedAction: undefined,
                    pendingMessageId: undefined,
                  }
                : entry,
            ),
          );
          setPendingActionError(null);
          setPendingActionErrorMessageId(null);
          return;
        }

        if (action === "confirm") {
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? { ...entry, pendingActionStatus: "failed" }
                : entry,
            ),
          );
        }

        const errorMessage =
          requestError instanceof AssistantApiError
            ? requestError.message
            : "Unable to update this proposed action. Please try again.";
        setPendingActionError(errorMessage);
        setPendingActionErrorMessageId(message.id);
      } finally {
        setResolvingMessageId(null);
      }
    },
    [
      accessToken,
      appendAssistantMessage,
      conversationId,
      messages,
      notifyCoursesChanged,
      refreshActiveCourse,
      refreshDashboard,
    ],
  );

  const dismissHandoffOffer = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              handoffDismissed: true,
              explanation: undefined,
              interpretedAction: undefined,
            }
          : entry,
      ),
    );
  }, []);

  const handleReverseConfirmedAction = useCallback(
    async (message: ChatMessage) => {
      if (!accessToken || message.workflowId === undefined) {
        return;
      }

      const shouldReverse = window.confirm(
        "Reverse this action? This will apply the stored rollback in Canvas.",
      );
      if (!shouldReverse) {
        return;
      }

      setReversingWorkflowId(message.workflowId);
      setPendingActionError(null);
      setPendingActionErrorMessageId(null);

      try {
        await reverseWorkflow(accessToken, String(message.workflowId));
        const activeConversationId = message.conversationId ?? conversationId;
        const conversation =
          activeConversationId !== undefined
            ? await fetchConversation(accessToken, activeConversationId)
            : null;
        const latestAssistantMessage = conversation?.messages
          .filter((entry) => entry.role === "assistant")
          .at(-1);

        setReversedWorkflowIds((current) => new Set(current).add(message.workflowId!));
        if (latestAssistantMessage) {
          setMessages((current) => {
            if (current.some((entry) => entry.id === String(latestAssistantMessage.id))) {
              return current;
            }
            return [
              ...current,
              {
                id: String(latestAssistantMessage.id),
                role: "assistant",
                content: latestAssistantMessage.content,
                timestamp: new Date(latestAssistantMessage.created_at),
                conversationId: conversation?.id,
              },
            ];
          });
        }
        void refreshActiveCourse();
        notifyCoursesChanged();
        void refreshDashboard();
      } catch (requestError) {
        const errorMessage =
          requestError instanceof WorkflowHistoryApiError
            ? requestError.message
            : "Unable to reverse this action. Please try again.";
        setPendingActionError(errorMessage);
        setPendingActionErrorMessageId(message.id);
      } finally {
        setReversingWorkflowId(null);
      }
    },
    [
      accessToken,
      conversationId,
      notifyCoursesChanged,
      refreshActiveCourse,
      refreshDashboard,
    ],
  );

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setInputError("Please enter a message before sending.");
        return;
      }

      setInputError(null);
      stickToBottomRef.current = true;
      onConversationStarted?.();

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((current) => [...current, userMessage]);

      // Only auto-cancel via a typed phrase ("never mind", etc.) when
      // exactly one preview is pending — with more than one open at once
      // (a grouped send_message batch), which one the phrase refers to is
      // ambiguous, so it falls through to a normal turn instead. Mirrors
      // deliverAssistantResponse's identical single-pending gate above.
      const soleActivePendingMessageId =
        activePendingMessageIds.length === 1
          ? activePendingMessageIds[0]
          : undefined;

      if (
        soleActivePendingMessageId !== undefined &&
        isCancellationPhrase(trimmed)
      ) {
        const pendingMessage = messages.find(
          (entry) =>
            entry.pendingMessageId === soleActivePendingMessageId &&
            entry.pendingActionStatus === "pending",
        );

        if (pendingMessage) {
          void resolvePendingAction(pendingMessage, "cancel");
          return;
        }
      }

      void deliverAssistantResponse(trimmed);
    },
    [
      activePendingMessageIds,
      deliverAssistantResponse,
      messages,
      onConversationStarted,
      resolvePendingAction,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      sendPrompt: handleSend,
    }),
    [handleSend],
  );

  useEffect(() => {
    if (!initialPrompt || initialPromptHandledRef.current === initialPrompt) {
      return;
    }

    // Deliberately not reset back to null after sending: onInitialPromptConsumed
    // clears the prompt in the parent asynchronously, so this same effect can
    // still re-run with the identical initialPrompt before that update lands
    // (guaranteed to happen under React 18 StrictMode's dev-only mount ->
    // cleanup -> remount cycle). Resetting the guard here made it forget it
    // had already sent this exact prompt, so the remount sent it a second
    // time. The guard only needs to remember "have I handled this string
    // yet" — the next real render, once pendingPrompt is actually cleared,
    // falls through via the `!initialPrompt` check above instead.
    initialPromptHandledRef.current = initialPrompt;
    handleSend(initialPrompt);
    onInitialPromptConsumed?.();
  }, [handleSend, initialPrompt, onInitialPromptConsumed]);

  const handleRetry = () => {
    if (!retryMessage || isDeliveringRef.current) {
      return;
    }

    void deliverAssistantResponse(retryMessage);
  };

  const handleStop = useCallback(() => {
    // Soft stop: aborts the in-flight fetch only (see deliverAssistantResponse).
    abortControllerRef.current?.abort();
  }, []);

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden shadow-md ring-1 ring-border/60">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-2 px-1 pt-1 pb-0">
        {onStartNewChat ? (
          <div className="flex shrink-0 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStartNewChat}
              disabled={isLoading}
            >
              <Plus className="size-4" aria-hidden="true" />
              New Chat
            </Button>
          </div>
        ) : null}

        <div
          ref={messageListRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        >
          {messages.map((message) =>
            message.role === "assistant" ? (
              <AssistantMessage
                key={message.id}
                message={message}
                isResolvingPendingAction={resolvingMessageId === message.id}
                pendingActionError={
                  pendingActionErrorMessageId === message.id
                    ? pendingActionError
                    : null
                }
                confirmBlockedReason={
                  message.pendingActionStatus === "pending" &&
                  messages.some(
                    (entry) =>
                      entry.id !== message.id &&
                      entry.pendingActionStatus === "executing",
                  )
                    ? "Another Canvas write is already running. Wait for it to finish before confirming."
                    : null
                }
                onConfirmPendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "confirm")
                    : undefined
                }
                onCancelPendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "cancel")
                    : undefined
                }
                onPausePendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "pause")
                    : undefined
                }
                onResumePendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "resume")
                    : undefined
                }
                onRenamePendingAction={
                  message.pendingMessageId
                    ? (displayName) =>
                        void resolvePendingAction(message, "rename", displayName)
                    : undefined
                }
                onDismissHandoff={
                  message.interpretedAction && !message.pendingMessageId
                    ? () => dismissHandoffOffer(message.id)
                    : undefined
                }
                isReversingAction={
                  message.workflowId !== undefined &&
                  reversingWorkflowId === message.workflowId
                }
                reversedWorkflowIds={reversedWorkflowIds}
                onReverseAction={handleReverseConfirmedAction}
              />
            ) : (
              <UserMessage key={message.id} message={message} />
            ),
          )}

          {isLoading ? (
            <LoadingIndicator
              label={ASSISTANT_LOADING_COPY[loadingStage]}
              note={loadingNote}
            />
          ) : null}
        </div>

        {error ? (
          <div className="shrink-0 space-y-2">
            <ErrorAlert message={error} />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isLoading || !retryMessage}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <ChatInput
          key={initialDraft ?? ""}
          onSend={handleSend}
          onStop={handleStop}
          isLoading={isLoading}
          inputError={inputError}
          initialValue={initialDraft ?? ""}
          modelSettings={modelSettings}
          llmProviders={llmProviders}
          onModelProviderChange={onModelProviderChange}
        />
      </CardContent>
    </Card>
  );
});
