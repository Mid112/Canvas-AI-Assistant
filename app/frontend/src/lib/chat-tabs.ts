/**
 * Chat tabs for the AI Assistant — the model and its rules, with no React in
 * sight so the awkward cases can be tested directly.
 *
 * A tab is a conversation bound to a course. The binding runs both ways: the
 * active course decides which tab you are on, and the tab you are on decides
 * the active course. That replaces the modal that used to explain, on every
 * switch, that your conversation would stay behind on the old course — the
 * tab strip shows that instead of describing it.
 *
 * The one invariant everything else follows from: **the active course is the
 * active tab's course**. Callers read it back off the focused tab rather than
 * tracking it separately, which is what makes a background open coherent —
 * a tab opened without focus holds its course until you click it.
 */

const CHAT_TABS_PREFIX = "assistant-chat-tabs:";

/** Browser-style cap. Three is the spec; the eviction rule below is what
 * makes hitting it survivable. */
export const MAX_CHAT_TABS = 3;

/** Shown for a tab that has no course yet — the one open at first launch,
 * before any course has been picked. */
export const UNBOUND_TAB_LABEL = "New chat";

export interface ChatTab {
  id: string;
  /** Local course id this tab is bound to, or null before a course is picked. */
  courseId: number | null;
  /** The course's display name, stored as the label it will be shown under.
   * A label, not an identifier — same category as a typed draft's courseName. */
  courseName: string | null;
  /** The conversation this tab is showing, or null for a fresh tab. A null
   * here is what makes a background-opened tab render the welcome message
   * rather than someone else's thread. */
  conversationId: number | null;
  /** Creation order. Drives display order and picks the eviction victim. */
  createdSeq: number;
  /** Last time this tab was focused. Breaks the tie when several tabs share a
   * course and one of them has to be reopened. */
  focusedSeq: number;
}

export interface ChatTabsState {
  /** Display order is creation order, so tabs never reshuffle under the cursor. */
  tabs: ChatTab[];
  activeTabId: string;
  /** Monotonic counter behind createdSeq / focusedSeq. Kept in state instead
   * of reading the clock so the reducers stay pure and tests stay exact. */
  nextSeq: number;
}

export interface ChatTabSeed {
  courseId?: number | null;
  courseName?: string | null;
}

function newTabId(): string {
  return crypto.randomUUID();
}

function makeTab(seq: number, seed?: ChatTabSeed): ChatTab {
  return {
    id: newTabId(),
    courseId: seed?.courseId ?? null,
    courseName: seed?.courseName ?? null,
    conversationId: null,
    createdSeq: seq,
    focusedSeq: seq,
  };
}

/** The single tab an instructor lands on before they have done anything. */
export function createChatTabsState(seed?: ChatTabSeed): ChatTabsState {
  const tab = makeTab(0, seed);
  return { tabs: [tab], activeTabId: tab.id, nextSeq: 1 };
}

export function activeChatTab(state: ChatTabsState): ChatTab {
  return (
    state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0]
  );
}

/** The tab a given course should reopen into, or undefined when it has none.
 *
 * Most recently focused wins. With tabs 1 and 2 both on course A and the
 * instructor sitting on tab 3, switching back to A lands on tab 2 — the one
 * they were last in. Picking is unavoidably a guess when two tabs hold the
 * same course, so it guesses at the more recent one and leaves the other a
 * click away. */
function findCourseTab(
  state: ChatTabsState,
  courseId: number,
): ChatTab | undefined {
  return state.tabs
    .filter((tab) => tab.courseId === courseId)
    .reduce<ChatTab | undefined>(
      (best, tab) =>
        best === undefined || tab.focusedSeq > best.focusedSeq ? tab : best,
      undefined,
    );
}

/** Makes room at capacity by dropping the oldest tab that is not the active one.
 *
 * Never the active tab, even when it is the oldest. Evicting it would close
 * the thread the instructor is looking at — possibly holding an unconfirmed
 * preview — which is exactly what opening a tab in the background is meant to
 * avoid. The oldest *other* tab goes instead. */
function evictForCapacity(tabs: ChatTab[], activeTabId: string): ChatTab[] {
  if (tabs.length < MAX_CHAT_TABS) {
    return tabs;
  }
  const victim = tabs
    .filter((tab) => tab.id !== activeTabId)
    .reduce<ChatTab | undefined>(
      (oldest, tab) =>
        oldest === undefined || tab.createdSeq < oldest.createdSeq
          ? tab
          : oldest,
      undefined,
    );
  return victim ? tabs.filter((tab) => tab.id !== victim.id) : tabs;
}

export interface OpenChatTabOptions extends ChatTabSeed {
  /** False opens the tab without leaving the current one — the instructor sees
   * it appear in the strip, the way a background tab does in a browser. */
  focus?: boolean;
}

/** Opens a new tab, evicting the oldest inactive one at capacity. */
export function openChatTab(
  state: ChatTabsState,
  options: OpenChatTabOptions = {},
): ChatTabsState {
  const focus = options.focus ?? true;
  const tab = makeTab(state.nextSeq, options);
  const kept = evictForCapacity(state.tabs, state.activeTabId);

  return {
    tabs: [...kept, tab],
    // A background open must survive its own eviction pass: if the active tab
    // were the one dropped, activeTabId would dangle.
    activeTabId: focus
      ? tab.id
      : kept.some((entry) => entry.id === state.activeTabId)
        ? state.activeTabId
        : tab.id,
    nextSeq: state.nextSeq + 1,
  };
}

export function focusChatTab(
  state: ChatTabsState,
  tabId: string,
): ChatTabsState {
  if (!state.tabs.some((tab) => tab.id === tabId)) {
    return state;
  }
  return {
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, focusedSeq: state.nextSeq } : tab,
    ),
    activeTabId: tabId,
    nextSeq: state.nextSeq + 1,
  };
}

/** Closes a tab. The last one cannot be closed — there is always somewhere to
 * be, so a fresh start is "+" then close the old one, never close-into-nothing. */
export function closeChatTab(
  state: ChatTabsState,
  tabId: string,
): ChatTabsState {
  if (state.tabs.length <= 1 || !state.tabs.some((tab) => tab.id === tabId)) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (tabId !== state.activeTabId) {
    return { ...state, tabs };
  }
  // Closing the tab you are on lands you where you last were, not at whichever
  // end of the strip happens to be nearest.
  const next = tabs.reduce((best, tab) =>
    tab.focusedSeq > best.focusedSeq ? tab : best,
  );
  return { ...state, tabs, activeTabId: next.id };
}

export function setChatTabConversation(
  state: ChatTabsState,
  tabId: string,
  conversationId: number | null,
): ChatTabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, conversationId } : tab,
    ),
  };
}

export interface SwitchCourseOptions {
  courseId: number;
  courseName?: string | null;
  /** False when the current tab is holding work the instructor has not
   * finished — an unconfirmed preview, a reply in flight. The new course still
   * gets its tab, but they are not dragged off what they were doing. */
  focus?: boolean;
}

/**
 * Routes an active-course change to a tab: reopen the course's existing tab,
 * or give it a new one.
 *
 * Every way of switching goes through here — the assistant dropdown, Set
 * Active on the dashboard or the Courses tab, and the assistant naming a
 * different course mid-request — so all four behave identically.
 */
export function switchChatTabCourse(
  state: ChatTabsState,
  { courseId, courseName, focus = true }: SwitchCourseOptions,
): ChatTabsState {
  const active = activeChatTab(state);

  if (active.courseId === courseId) {
    return state;
  }

  // The first course an instructor picks adopts the tab they are already on.
  // Spawning a second tab there would leave an empty "New chat" behind on
  // every launch, which is noise, not history.
  if (active.courseId === null) {
    return {
      ...state,
      tabs: state.tabs.map((tab) =>
        tab.id === active.id
          ? { ...tab, courseId, courseName: courseName ?? null }
          : tab,
      ),
    };
  }

  const existing = findCourseTab(state, courseId);
  if (existing) {
    // Reopening an existing tab still respects focus: the course gets its tab
    // back either way, but a background switch leaves the instructor put.
    return focus ? focusChatTab(state, existing.id) : state;
  }

  return openChatTab(state, { courseId, courseName, focus });
}

/**
 * Display labels, disambiguated.
 *
 * Tabs are named after their course. Two tabs can hold the same course
 * (open one, then open another without switching away), so the second and
 * later get a counter — otherwise the strip shows the same word twice and
 * neither one tells you which is which.
 */
export function chatTabLabels(tabs: ChatTab[]): Map<string, string> {
  const seen = new Map<string, number>();
  const labels = new Map<string, string>();

  for (const tab of tabs) {
    const base = tab.courseName?.trim() || UNBOUND_TAB_LABEL;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    labels.set(tab.id, count === 1 ? base : `${base} (${count})`);
  }

  return labels;
}

function storageKey(userId: number): string {
  return `${CHAT_TABS_PREFIX}${userId}`;
}

function isChatTab(value: unknown): value is ChatTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Partial<ChatTab>;
  return (
    typeof tab.id === "string" &&
    typeof tab.createdSeq === "number" &&
    typeof tab.focusedSeq === "number" &&
    (tab.courseId === null || typeof tab.courseId === "number") &&
    (tab.conversationId === null || typeof tab.conversationId === "number")
  );
}

/** Restores the strip after a reload. Returns null when there is nothing
 * usable stored, leaving the caller to seed a fresh single tab. */
export function loadChatTabs(userId: number): ChatTabsState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ChatTabsState>;
    const tabs = Array.isArray(parsed.tabs) ? parsed.tabs.filter(isChatTab) : [];
    if (tabs.length === 0) return null;

    // Trust the stored tabs, not the stored pointers: a truncated or
    // hand-edited payload must not produce a state with no reachable tab.
    const capped = tabs.slice(0, MAX_CHAT_TABS);
    const activeTabId = capped.some((tab) => tab.id === parsed.activeTabId)
      ? (parsed.activeTabId as string)
      : capped[capped.length - 1].id;
    const highestSeq = capped.reduce(
      (max, tab) => Math.max(max, tab.createdSeq, tab.focusedSeq),
      0,
    );
    const nextSeq =
      typeof parsed.nextSeq === "number" && parsed.nextSeq > highestSeq
        ? parsed.nextSeq
        : highestSeq + 1;

    return { tabs: capped, activeTabId, nextSeq };
  } catch {
    return null;
  }
}

export function saveChatTabs(userId: number, state: ChatTabsState): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Quota / private mode — a lost tab strip must not break the assistant.
  }
}
