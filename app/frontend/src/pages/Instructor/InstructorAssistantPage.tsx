import { ChevronRight, History, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { AssistantLimitedModeBanner } from "@/components/chat/AssistantLimitedModeBanner";
import { ChatTabStrip } from "@/components/chat/ChatTabStrip";
import { DraftWorkspacePanel } from "@/components/chat/DraftWorkspacePanel";
import { ChatWindow, type ChatWindowHandle } from "@/components/chat/ChatWindow";
import { ActiveCourseContextBar } from "@/components/courses/ActiveCourseContextBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import {
  InstructorAssistantSuggestedActions,
} from "@/pages/Instructor/InstructorAssistant/InstructorAssistantHeader";
import { useChatTabs } from "@/pages/Instructor/InstructorAssistant/useChatTabs";
import { buildSuggestedActions } from "@/data/assistantSeedData";
import {
  activeChatTab,
  chatTabLimit,
  closeChatTab,
  focusChatTab,
  openChatTab,
  setChatTabConversation,
  switchChatTabCourse,
  type ChatTab,
} from "@/lib/chat-tabs";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import {
  clearStoredDeferredDraft,
  getStoredDeferredDraft,
} from "@/lib/deferred-assistant-storage";
import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";
import { resolveQuickAction } from "@/lib/quick-actions";
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
  const { activeCourse, availableCourses, selectActiveCourse } =
    useActiveCourse();
  // Labels only — the active course now reaches the prompt through
  // resolveQuickAction at click time, so this list no longer depends on it.
  const suggestedActions = useMemo(() => buildSuggestedActions(), []);
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
  // Course-context sync must follow activeCourse changes, not every history
  // selection. pendingConversationId is read from a ref inside the effect so
  // loading a transcript does not POST /chat/course-context and fork away
  // from the conversation the instructor just opened (#1507 re-review).
  const pendingConversationIdRef = useRef(pendingConversationId);
  pendingConversationIdRef.current = pendingConversationId;
  // Keyed by tab *and* course, not by course alone. Tabs are one-per-course
  // now, but the pairing is not stable over time: closing a course's tab and
  // reopening it produces a new tab with no conversation id, and the sync is
  // how it learns one. A course-only key would call that a repeat and skip it.
  const lastSyncedTabRef = useRef<string | null>(null);

  const {
    state: tabsState,
    update: updateTabs,
    activeTab,
    isHydrated: tabsHydrated,
  } = useChatTabs(user?.id);

  // selectActiveCourse closes over activeCourse, so the provider hands back a
  // new function every time the course changes. An effect that both depends on
  // it and calls it therefore re-fires on its own result — which is how the
  // first version of this spun. These effects need to *call* it, never to
  // react to which version of it exists, so it lives in a ref.
  const selectActiveCourseRef = useRef(selectActiveCourse);
  useEffect(() => {
    selectActiveCourseRef.current = selectActiveCourse;
  }, [selectActiveCourse]);

  // Read at the moment of a course switch, not depended on: it flips while a
  // reply streams, and re-running then would relocate the instructor to a tab
  // they were deliberately left out of.
  const hasPendingWorkRef = useRef(hasPendingAssistantWork);
  useEffect(() => {
    hasPendingWorkRef.current = hasPendingAssistantWork;
  }, [hasPendingAssistantWork]);

  const tabsStateRef = useRef(tabsState);
  useEffect(() => {
    tabsStateRef.current = tabsState;
  }, [tabsState]);

  // Declared before the routing effect below so the ids are populated by the
  // time it first runs.
  const availableCourseIdsRef = useRef<number[]>([]);
  useEffect(() => {
    availableCourseIdsRef.current = availableCourses.map((course) => course.id);
  }, [availableCourses]);

  /** The courses "+" is allowed to open a tab on.
   *
   * Published only, matching the active-course dropdown — a tab sets the
   * active course, so offering one the dropdown would refuse produces a tab
   * whose course never actually loads. Labelled with the same formatter the
   * provider uses for displayName, so a tab opened with "+" reads identically
   * to the same course's tab opened from the dropdown. */
  const tabCourses = useMemo(
    () =>
      availableCourses
        .filter((course) => course.isPublished)
        .map((course) => ({
          id: course.id,
          name: formatInstructorCourseTitle(course),
        })),
    [availableCourses],
  );
  const newTabLimit = useMemo(
    () => chatTabLimit(tabsState, tabCourses),
    [tabsState, tabCourses],
  );

  /** Points the dropdown at a course, if that course still exists.
   *
   * Tabs survive a reload, so a stored one can name a course the instructor no
   * longer has — unenrolled, unpublished, or wiped when the Canvas sandbox was
   * rebuilt. selectActiveCourse fails server-side for those and the provider
   * rolls the active course back, which is what made the page flicker: the
   * rollback looked like another switch, so it was tried again, and again. */
  const selectCourseIfAvailable = useCallback((courseId: number) => {
    if (!availableCourseIdsRef.current.includes(courseId)) {
      return;
    }
    void selectActiveCourseRef.current(courseId);
  }, []);

  // The course this page has already routed to a tab. One route per change:
  // without it, any later re-render could re-run the routing with a different
  // hasPendingWork and yank the instructor into a background tab.
  const lastRoutedCourseIdRef = useRef<number | null>(null);

  const rememberTabConversation = useCallback(
    (tabId: string, conversationId: number | null) => {
      updateTabs((current) =>
        setChatTabConversation(current, tabId, conversationId),
      );
    },
    [updateTabs],
  );

  const [typedDraftRevision, setTypedDraftRevision] = useState(0);
  const [discardingTypedId, setDiscardingTypedId] = useState<string | null>(
    null,
  );
  // Collapsed by default so chat stays the primary surface (#1454).
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
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
    // The envelope follows the tab, not the course dropdown. They part company
    // whenever a tab is opened in the background: the instructor has picked a
    // new course, but the chat on screen still belongs to the old tab. Writing
    // the new course against that tab's conversation would fork the thread
    // holding their unconfirmed preview — the exact thing a background open
    // exists to protect.
    if (!accessToken || activeTab.courseId === null) {
      return;
    }
    const courseId = activeTab.courseId;
    const pendingId = pendingConversationIdRef.current;
    // When there is no pending conversation yet, wait for deferred-draft
    // hydration to finish before deciding whether we have a conversation
    // id to sync against (restore may supply one shortly after mount).
    if (pendingId === undefined && !deferredListLoaded) {
      return;
    }
    // History selection updates pendingConversationId without changing the
    // active course. That must not re-POST course-context — syncing the
    // loaded id against a different sidebar course forks and the success
    // handler would drop the transcript the instructor just opened.
    if (lastSyncedTabRef.current === `${activeTab.id}:${courseId}`) {
      return;
    }
    // Prefer a stored deferred draft's conversation id when the pending id
    // is still unset (restore applies it on a timeout).
    let conversationIdForSync = pendingId;
    if (conversationIdForSync === undefined && user?.id) {
      const storedDraft = getStoredDeferredDraft(user.id);
      if (storedDraft?.conversationId !== undefined) {
        conversationIdForSync = storedDraft.conversationId;
      }
    }
    // Never POST /chat/course-context without a conversation id: that path
    // always creates a fresh Conversation row, so every Assistant visit
    // would accumulate empty "No messages yet" history entries (#1507).
    // Course context is still written on the first real chat turn via
    // get_or_create_conversation.
    if (conversationIdForSync === undefined) {
      return;
    }
    let cancelled = false;
    void syncAssistantCourseContext(accessToken, {
      localCourseId: courseId,
      conversationId: conversationIdForSync,
    })
      .then((result) => {
        if (cancelled) return;
        lastSyncedTabRef.current = `${activeTab.id}:${courseId}`;
        // The server owns conversation identity; the tab only records what it
        // decided, so returning to this tab reopens this thread rather than
        // the course's most recent one.
        rememberTabConversation(activeTab.id, result.conversationId);
        // Course switches on an existing thread fork onto a different
        // conversation server-side (get_or_create_conversation), so the
        // returned id must always be adopted when it differs — not only
        // when nothing was pending — or ChatWindow keeps posting to the
        // old conversation while the synced envelope lives on the fork.
        // Clear loaded history + remount chat: ChatWindow skips hydrating
        // from initialConversationId while loadedConversation is set.
        if (result.conversationId !== pendingConversationIdRef.current) {
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
    // pendingConversationId is intentionally omitted: read via ref so history
    // load does not re-trigger sync. deferredListLoaded unlocks reading a
    // stored draft id after hydrate; lastSyncedTabRef prevents a second pass
    // for the same tab on the same course.
  }, [
    accessToken,
    activeTab.courseId,
    activeTab.id,
    deferredListLoaded,
    rememberTabConversation,
    user?.id,
  ]);

  // Every way of switching course lands here — the assistant's own dropdown,
  // Set Active on the dashboard or the Courses tab, and the assistant naming a
  // different course mid-request — so all four route to a tab identically.
  //
  // Pending work keeps the instructor where they are: the new course still
  // gets its tab, it just opens behind the one holding their preview.
  useEffect(() => {
    const courseId = activeCourse?.localId;
    // Wait for the stored strip: routing into the placeholder tab first
    // would bind the course to a tab hydration is about to discard.
    if (
      !tabsHydrated ||
      courseId === undefined ||
      lastRoutedCourseIdRef.current === courseId
    ) {
      return;
    }
    lastRoutedCourseIdRef.current = courseId;

    const current = tabsStateRef.current;
    const next = switchChatTabCourse(current, {
      courseId,
      courseName: activeCourse?.displayName ?? null,
      focus: !hasPendingWorkRef.current,
    });
    if (next === current) {
      return;
    }
    updateTabs(() => next);

    // A background open leaves the instructor on a tab for a different course,
    // and the dropdown reads the tab in front of them — so put it back.
    //
    // Done here, once, rather than as an effect watching the active course:
    // an effect that both reads and writes the active course is a loop with
    // extra steps, and the ref guard above is what stops this correction from
    // being re-routed as a switch of its own.
    const nextActive = activeChatTab(next);
    if (nextActive.courseId !== null && nextActive.courseId !== courseId) {
      lastRoutedCourseIdRef.current = nextActive.courseId;
      selectCourseIfAvailable(nextActive.courseId);
    }
  }, [
    activeCourse?.localId,
    activeCourse?.displayName,
    selectCourseIfAvailable,
    tabsHydrated,
    updateTabs,
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
        // Don't clobber a newer id course-sync already adopted while this
        // timeout was queued (pre-fork draft id would put chat back on the
        // old thread while course_context lives on the fork).
        setPendingConversationId((current) => {
          if (current !== undefined && current !== draft.conversationId) {
            return current;
          }
          return draft.conversationId;
        });
      }
      if (draft.deferredRequestId != null) {
        setPendingDeferredRequestId(draft.deferredRequestId);
      }
      setShowStarterGuidance(false);
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

  const handleSuggestedAction = (actionId: string) => {
    const behaviour = resolveQuickAction(actionId, activeCourse?.displayName);
    if (!behaviour) {
      return;
    }

    // Same destinations as the dashboard's Quick AI Actions: the creators are
    // purpose-built forms, so these buttons open them instead of talking the
    // instructor through the same task in chat.
    if (behaviour.kind === "navigate") {
      if (behaviour.state) {
        navigate(behaviour.path, { state: behaviour.state });
      } else {
        navigate(behaviour.path);
      }
      return;
    }

    setSelectedConversation(null);
    setShowStarterGuidance(false);
    chatWindowRef.current?.sendPrompt(behaviour.prompt);
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

  /** Points the chat at whatever thread a tab was last showing.
   *
   * A tab with no conversation yet (a fresh one, or one opened in the
   * background) clears the pending id, which is what leaves it on the welcome
   * message instead of someone else's transcript. The next turn there creates
   * the conversation server-side, and the sync handler records it back. */
  const showTab = useCallback(
    (tab: ChatTab) => {
      setSelectedConversation(null);
      setPendingDraft(null);
      setPendingPrompt(null);
      setPendingMessageId(undefined);
      setPendingDeferredRequestId(null);
      setHistoryError(null);
      setPendingConversationId(tab.conversationId ?? undefined);
      setShowStarterGuidance(tab.conversationId === null);
      setChatSessionKey((current) => current + 1);
      // Clicking a tab is an explicit choice, so the dropdown follows it here
      // and marks the course as already routed — otherwise the effect above
      // would treat this as a fresh switch and open a second tab for it.
      if (tab.courseId !== null && tab.courseId !== activeCourse?.localId) {
        lastRoutedCourseIdRef.current = tab.courseId;
        selectCourseIfAvailable(tab.courseId);
      }
    },
    [activeCourse?.localId, selectCourseIfAvailable],
  );

  const handleFocusTab = (tabId: string) => {
    if (tabId === tabsState.activeTabId) {
      return;
    }
    const tab = tabsState.tabs.find((entry) => entry.id === tabId);
    if (!tab) {
      return;
    }
    updateTabs((current) => focusChatTab(current, tabId));
    showTab(tab);
  };

  const handleCloseTab = (tabId: string) => {
    const next = closeChatTab(tabsState, tabId);
    if (next === tabsState) {
      return;
    }
    updateTabs(() => next);
    // Closing the tab you were on lands you on another one, so the chat has
    // to follow. Closing a background tab leaves the chat alone.
    if (tabId === tabsState.activeTabId) {
      showTab(activeChatTab(next));
    }
  };

  /** The chat's own New Chat button: a fresh thread on the course you are on.
   *
   * It used to open a tab, back when two tabs could share a course. Under
   * one-per-course that is not a tab it is allowed to open, and routing it to
   * "+" instead would send the instructor to some other course — so the fresh
   * thread happens here, in the tab they are already in. Clearing the recorded
   * conversation is what makes it stick: leave it and coming back to this tab
   * reopens the thread they just set aside. */
  const handleNewConversation = () => {
    updateTabs((current) =>
      setChatTabConversation(current, current.activeTabId, null),
    );
    handleStartNewChat();
  };

  /** Moves the chat tab to the course a turn actually resolved to.
   *
   * The assistant re-resolves the course from the message, so asking for an
   * assignment "for Capstone Project" while COSC 676 is selected produces a
   * Capstone Project preview. Leaving that preview sitting in the COSC 676
   * tab shows two different courses on one screen and invites confirming a
   * write against the wrong one.
   *
   * Foreground, unlike a dropdown switch made mid-preview: the instructor
   * asked for this course in this breath, so the preview they are about to
   * review is the thing they want to be looking at. */
  const handleResolvedCourse = useCallback(
    (course: {
      localCourseId: number;
      courseName?: string;
      conversationId?: number;
    }) => {
      lastRoutedCourseIdRef.current = course.localCourseId;
      updateTabs((current) => {
        const next = switchChatTabCourse(current, {
          courseId: course.localCourseId,
          courseName: course.courseName ?? null,
          focus: true,
        });
        // The backend forks the conversation on a course change, so the tab
        // records the id this turn ended up on rather than the one it started
        // from — otherwise returning to it reopens the pre-fork thread.
        return course.conversationId === undefined
          ? next
          : setChatTabConversation(
              next,
              activeChatTab(next).id,
              course.conversationId,
            );
      });
      selectCourseIfAvailable(course.localCourseId);
    },
    [selectCourseIfAvailable, updateTabs],
  );

  // A new tab is a different course, never a second thread on the one you are
  // already in — that is what one-per-course means. The strip has already
  // greyed "+" out and said why when there is no course left to open, so this
  // is a second line of defence rather than the place the instructor finds out.
  const handleNewTab = () => {
    const next = openChatTab(tabsState, tabCourses);
    if (next === tabsState) {
      return;
    }
    updateTabs(() => next);
    handleStartNewChat();
    // The tab is the course, so opening one is a course switch. Marked as
    // already routed first, or the effect above would see the dropdown move
    // and try to open a tab for it a second time.
    const opened = activeChatTab(next);
    if (opened.courseId !== null && opened.courseId !== activeCourse?.localId) {
      lastRoutedCourseIdRef.current = opened.courseId;
      selectCourseIfAvailable(opened.courseId);
    }
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

      <ChatTabStrip
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        limit={newTabLimit}
        onFocus={handleFocusTab}
        onClose={handleCloseTab}
        onNew={handleNewTab}
      />

      <InstructorAssistantSuggestedActions
        actions={suggestedActions}
        onSelect={handleSuggestedAction}
        disabled={isLoading}
        visible={showStarterGuidance}
      />

      {/* Chat and history sit side by side, history on the right. It used to
          be a full-width band above the chat, which cost vertical space on the
          one surface that needs it most; as a column it costs horizontal space
          only while it is open. */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* The chat is the primary surface: it takes every pixel the collapsed
            panels don't need (min-h-0 + flex-1), and all scrolling happens
            inside it rather than on the page frame, so the input never scrolls
            out of reach (#1, #10, #1454). */}
        <div className="min-w-0 flex-1 overflow-hidden">
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
            onResolvedCourse={handleResolvedCourse}
            onDeferredRequest={() => void loadDeferredRequests()}
            onDeferredResumeComplete={() => {
              setPendingDeferredRequestId(null);
              void loadDeferredRequests();
            }}
            onLoadingChange={setIsLoading}
            onConversationStarted={() => setShowStarterGuidance(false)}
            onPendingWorkChange={setHasPendingAssistantWork}
            onStartNewChat={handleNewConversation}
            modelSettings={llmSettings}
            llmProviders={llmProviders}
            onModelProviderChange={handleModelProviderChange}
          />
        </div>

        {isHistoryExpanded ? (
          <section
            aria-labelledby="assistant-history-heading"
            className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background px-3 py-2 shadow-sm"
          >
            <div className="flex shrink-0 items-center justify-between gap-1">
              <h2
                id="assistant-history-heading"
                className="truncate text-sm font-semibold text-foreground"
              >
                Conversation History ({conversations.length})
              </h2>
              <div className="flex shrink-0 items-center">
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setIsHistoryExpanded(false)}
                  aria-expanded
                  aria-controls="assistant-history-content"
                  aria-label="Collapse conversation history"
                  title="Collapse conversation history"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div
              id="assistant-history-content"
              className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto"
            >
              {historyError ? (
                <p role="alert" className="mb-2 text-sm text-destructive">
                  {historyError}
                </p>
              ) : null}

              {conversations.length === 0 && !isHistoryLoading ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  Previous conversations appear here.
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
                      <span>
                        {formatConversationTime(conversation.updated_at)}
                      </span>
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
        ) : (
          // Collapsed: a rail rather than nothing, so the panel stays
          // discoverable and the chat does not jump width as it opens.
          <div className="flex shrink-0 flex-col items-center">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setIsHistoryExpanded(true)}
              aria-expanded={false}
              aria-controls="assistant-history-content"
              aria-label={`Conversation History (${conversations.length})`}
              title={`Conversation History (${conversations.length})`}
            >
              <History className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
