import { useCallback, useEffect, useRef, useState } from "react";

import {
  activeChatTab,
  createChatTabsState,
  loadChatTabs,
  saveChatTabs,
  type ChatTab,
  type ChatTabsState,
} from "@/lib/chat-tabs";

/**
 * Holds the tab strip's state and keeps it on disk.
 *
 * Deliberately thin. The rules live in lib/chat-tabs.ts and the wiring —
 * what focusing a tab does to the chat — lives in the assistant page. This
 * only owns "which tabs exist for this user, and do they survive a reload".
 *
 * Tabs never decide conversation identity. The server already routes a course
 * switch to that course's conversation (see _find_or_fork_conversation_for_course):
 * a tab just remembers which conversation it was last showing, so returning to
 * it lands on the same thread instead of the course's most recent one.
 */
export function useChatTabs(userId: number | undefined) {
  const [state, setState] = useState<ChatTabsState>(createChatTabsState);
  const hydratedForUserRef = useRef<number | null>(null);
  // Exposed as state, not just a ref, because callers have to *wait* for it.
  // Routing a course into the tabs before the stored strip is read would
  // bind it to the placeholder tab, and hydration would then overwrite that
  // — leaving the page pointing at a course no tab claims.
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    if (userId === undefined || hydratedForUserRef.current === userId) {
      return;
    }
    hydratedForUserRef.current = userId;
    // Restores the stored strip once the signed-in user is known. localStorage
    // is keyed by user id, so this cannot be done in the initial state.
    setState(loadChatTabs(userId) ?? createChatTabsState());
    setIsHydrated(true);
  }, [userId]);

  useEffect(() => {
    // Only persist after hydrating: writing the placeholder single tab first
    // would erase a real stored strip before it had been read back.
    if (userId === undefined || hydratedForUserRef.current !== userId) {
      return;
    }
    saveChatTabs(userId, state);
  }, [state, userId]);

  /** Applies a reducer from lib/chat-tabs and reports the tab left in front. */
  const update = useCallback(
    (reduce: (current: ChatTabsState) => ChatTabsState): void => {
      setState((current) => reduce(current));
    },
    [],
  );

  return {
    state,
    update,
    activeTab: activeChatTab(state),
    isHydrated,
  } satisfies {
    state: ChatTabsState;
    update: (reduce: (current: ChatTabsState) => ChatTabsState) => void;
    activeTab: ChatTab;
    isHydrated: boolean;
  };
}
