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
 * Two invariants everything else follows from:
 *
 * 1. **The active course is the active tab's course.** Callers read it back off
 *    the focused tab rather than tracking it separately, which is what makes a
 *    background open coherent — a tab opened without focus holds its course
 *    until you click it.
 * 2. **No two tabs hold the same course.** A tab therefore *is* a course, which
 *    makes the strip a course switcher you can read at a glance, and makes
 *    "which tab does this course reopen into" a lookup instead of a guess.
 *
 * Invariant 2 is why the ceiling is not a single number. Five is the cap, but
 * an instructor with three courses can only ever have three course tabs, so
 * the real ceiling is whichever binds first — see chatTabLimit, which reports
 * *which* one it was so the UI can say so rather than just going grey.
 */

const CHAT_TABS_PREFIX = "assistant-chat-tabs:";

/** Browser-style cap on how many tabs can be open at once. Not the whole
 * story: one-course-per-tab can bite well before this does. */
export const MAX_CHAT_TABS = 5;

/** Shown for a tab that has no course yet — the one open at first launch,
 * before any course has been picked. */
export const UNBOUND_TAB_LABEL = "New chat";

export interface ChatTab {
  id: string;
  /** Local course id this tab is bound to, or null before a course is picked.
   * Unique across the strip for every non-null value (invariant 2). */
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
  /** Last time this tab was focused. Decides where closing the active tab
   * lands, and which of two same-course tabs a legacy stored strip keeps. */
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

/** A course the strip is allowed to open a tab on. The caller decides which
 * courses qualify (published ones, matching the active-course dropdown) and
 * what they are called; this module only reads ids and labels. */
export interface ChatTabCourse {
  id: number;
  name?: string | null;
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

/** The tab holding a course, or undefined when it has none.
 *
 * A plain lookup, because invariant 2 means there is at most one. The previous
 * design allowed several and had to guess at the most recently focused; making
 * the course unique is what removed the guess. */
function findCourseTab(
  state: ChatTabsState,
  courseId: number,
): ChatTab | undefined {
  return state.tabs.find((tab) => tab.courseId === courseId);
}

/** Binds a course onto a tab that does not have one yet. */
function bindTabCourse(
  state: ChatTabsState,
  tabId: string,
  course: ChatTabSeed,
): ChatTabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? {
            ...tab,
            courseId: course.courseId ?? null,
            courseName: course.courseName ?? null,
          }
        : tab,
    ),
  };
}

/** Makes room at capacity by dropping the oldest tab that is not the active one.
 *
 * Only the active-course path uses this. "+" refuses at the cap and says why,
 * because the instructor is asking for a tab and can be told no — but a course
 * going active elsewhere in the app (Set Active on the dashboard, the
 * assistant resolving a different course mid-request) is not a request the
 * strip gets to decline. Refusing there would leave the dropdown naming one
 * course while the chat sits in another's thread, breaking invariant 1.
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

/** Appends a tab, evicting at the cap. Internal: every caller has already
 * established that no tab holds this course. */
function addChatTab(
  state: ChatTabsState,
  seed: ChatTabSeed,
  focus: boolean,
): ChatTabsState {
  const tab = makeTab(state.nextSeq, seed);
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

/**
 * Why "+" is unavailable, or that it is available.
 *
 * Reported as a variant rather than a boolean because the two ways of running
 * out are not the same fact and do not have the same answer: at the tab cap
 * closing a tab frees a slot, but with every course already open closing one
 * changes nothing — there is no other course to put there. A greyed-out button
 * cannot tell those apart, so the strip renders this instead.
 */
export type ChatTabLimit =
  | { kind: "available"; course: ChatTabCourse }
  | { kind: "no-courses" }
  | { kind: "all-courses-open"; courseCount: number }
  | { kind: "max-tabs"; maxTabs: number };

/** The course "+" would open: the first one in the caller's list that no tab
 * already holds. First rather than any, so the choice is the same every time
 * the instructor looks at it. */
function unopenedCourse(
  state: ChatTabsState,
  courses: ChatTabCourse[],
): ChatTabCourse | undefined {
  const open = new Set(
    state.tabs
      .map((tab) => tab.courseId)
      .filter((courseId): courseId is number => courseId !== null),
  );
  return courses.find((course) => !open.has(course.id));
}

export function chatTabLimit(
  state: ChatTabsState,
  courses: ChatTabCourse[],
): ChatTabLimit {
  if (courses.length === 0) {
    return { kind: "no-courses" };
  }

  const course = unopenedCourse(state, courses);
  // Checked before the cap, and deliberately: with five courses and five tabs
  // both limits are true at once, but only this one is useful. Telling someone
  // to close a tab so they can open another course, when every course they
  // have is already open, sends them round a loop.
  if (course === undefined) {
    return { kind: "all-courses-open", courseCount: courses.length };
  }
  if (state.tabs.length >= MAX_CHAT_TABS) {
    return { kind: "max-tabs", maxTabs: MAX_CHAT_TABS };
  }
  return { kind: "available", course };
}

/** The sentence for a limit, or null when there is nothing to explain.
 *
 * Lives here rather than in the component so the wording is covered by the
 * same tests as the rule it describes — a correct rule explained wrongly is
 * still a bug the instructor has to work around. */
export function describeChatTabLimit(limit: ChatTabLimit): string | null {
  switch (limit.kind) {
    case "available":
      return null;
    case "no-courses":
      return "No courses to open a tab for yet.";
    case "all-courses-open":
      return limit.courseCount === 1
        ? "One tab per course, and your only course is already open."
        : `One tab per course, and all ${limit.courseCount} of your courses are already open.`;
    case "max-tabs":
      return `${limit.maxTabs} tabs is the maximum. Close one to open another course.`;
  }
}

/**
 * Opens a tab on a course that is not already open — what "+" does.
 *
 * Returns the state unchanged when there is nothing to open, which is how the
 * caller distinguishes refused from done; chatTabLimit says why. Unlike a
 * course going active elsewhere, this evicts nothing: the instructor asked for
 * a tab, so they can be told no, and silently retiring a thread they were
 * keeping would be the worse answer.
 */
export function openChatTab(
  state: ChatTabsState,
  courses: ChatTabCourse[],
): ChatTabsState {
  const course = unopenedCourse(state, courses);
  if (course === undefined || state.tabs.length >= MAX_CHAT_TABS) {
    return state;
  }

  // The launch tab has no course. Binding it, rather than opening a second one,
  // keeps an empty "New chat" from sitting in the strip forever — and it would
  // sit there forever, because nothing else ever adopts it once a course tab
  // exists. Same rule as the first dropdown pick below.
  const active = activeChatTab(state);
  if (active.courseId === null) {
    return bindTabCourse(state, active.id, {
      courseId: course.id,
      courseName: course.name ?? null,
    });
  }

  return addChatTab(
    state,
    { courseId: course.id, courseName: course.name ?? null },
    true,
  );
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
 *
 * This path never refuses. The course is already active by the time it gets
 * here; the only question is which tab shows it.
 */
export function switchChatTabCourse(
  state: ChatTabsState,
  { courseId, courseName, focus = true }: SwitchCourseOptions,
): ChatTabsState {
  // Checked before the adopt rule below, not after. An unbound tab plus a tab
  // already holding this course used to adopt anyway and produce two tabs on
  // one course — the exact thing invariant 2 exists to prevent.
  const existing = findCourseTab(state, courseId);
  if (existing) {
    if (existing.id === state.activeTabId) {
      return state;
    }
    // Reopening an existing tab still respects focus: the course gets its tab
    // back either way, but a background switch leaves the instructor put.
    return focus ? focusChatTab(state, existing.id) : state;
  }

  // The first course an instructor picks adopts the tab they are already on.
  // Spawning a second tab there would leave an empty "New chat" behind on
  // every launch, which is noise, not history.
  const active = activeChatTab(state);
  if (active.courseId === null) {
    return bindTabCourse(state, active.id, { courseId, courseName });
  }

  return addChatTab(state, { courseId, courseName }, focus);
}

/**
 * Display labels, disambiguated.
 *
 * Tabs are named after their course, and no two tabs share a course — but two
 * *different* courses can still read the same, because a tab is labelled with
 * formatInstructorCourseTitle's output and nothing guarantees that is unique.
 * The counter is for that case: without it the strip shows one word twice and
 * the two close buttons get the same accessible name.
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

/** Collapses same-course tabs down to one, keeping the one last focused.
 *
 * A migration, not a rule: duplicates were supported until one-course-per-tab
 * landed, so a strip stored by the previous build can hold them and would
 * otherwise arrive as a state the reducers can no longer produce or repair.
 * Last focused wins because that is the thread the instructor was actually
 * using; stored order is preserved among the survivors so the strip does not
 * reshuffle across the upgrade. */
function dedupeByCourse(tabs: ChatTab[]): ChatTab[] {
  const keeper = new Map<number | null, ChatTab>();
  for (const tab of tabs) {
    const current = keeper.get(tab.courseId);
    if (current === undefined || tab.focusedSeq > current.focusedSeq) {
      keeper.set(tab.courseId, tab);
    }
  }
  const kept = new Set([...keeper.values()].map((tab) => tab.id));
  return tabs.filter((tab) => kept.has(tab.id));
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
    const capped = dedupeByCourse(tabs).slice(0, MAX_CHAT_TABS);
    // When the tab they were last on is one the dedupe dropped, land on the
    // tab that absorbed it rather than at the end of the strip — the course is
    // what they had open, and it is still here under a different tab id.
    const stored = tabs.find((tab) => tab.id === parsed.activeTabId);
    const activeTabId =
      (capped.some((tab) => tab.id === parsed.activeTabId)
        ? (parsed.activeTabId as string)
        : capped.find((tab) => tab.courseId === stored?.courseId)?.id) ??
      capped[capped.length - 1].id;
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
