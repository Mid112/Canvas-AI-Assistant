import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_CHAT_TABS,
  activeChatTab,
  chatTabLabels,
  chatTabLimit,
  closeChatTab,
  createChatTabsState,
  describeChatTabLimit,
  focusChatTab,
  loadChatTabs,
  openChatTab,
  saveChatTabs,
  setChatTabConversation,
  switchChatTabCourse,
  type ChatTab,
  type ChatTabsState,
} from "@/lib/chat-tabs";

const CAPSTONE = { courseId: 3, courseName: "Capstone Project" };
const MATH = { courseId: 4, courseName: "Calculus" };
const HISTORY = { courseId: 5, courseName: "World History" };

/** The same three courses as the constants above, in the shape "+" reads. */
const COURSES = [
  { id: 3, name: "Capstone Project" },
  { id: 4, name: "Calculus" },
  { id: 5, name: "World History" },
];

/** More courses than tabs, so the tab cap is what bites rather than the
 * one-per-course rule. */
const MANY_COURSES = Array.from({ length: MAX_CHAT_TABS + 3 }, (_, index) => ({
  id: 10 + index,
  name: `Course ${index + 1}`,
}));

/** Course names in strip order — what the instructor actually sees. */
function strip(state: ChatTabsState): string[] {
  const labels = chatTabLabels(state.tabs);
  return state.tabs.map((tab) => labels.get(tab.id)!);
}

/** Presses "+" until it refuses, which is how the strip reaches the cap. */
function fillTabs(courses = MANY_COURSES): ChatTabsState {
  let state = createChatTabsState();
  for (let index = 0; index < courses.length; index += 1) {
    state = openChatTab(state, courses);
  }
  return state;
}

describe("chat tabs", () => {
  it("starts on exactly one tab", () => {
    const state = createChatTabsState();

    expect(state.tabs).toHaveLength(1);
    expect(activeChatTab(state).id).toBe(state.activeTabId);
    expect(activeChatTab(state).courseId).toBeNull();
    expect(strip(state)).toEqual(["New chat"]);
  });

  // The tab an instructor lands on has no course yet. Binding it, rather than
  // opening a second one, keeps an empty "New chat" from being left behind on
  // every single launch.
  it("adopts the first course into the tab already open", () => {
    const state = switchChatTabCourse(createChatTabsState(), CAPSTONE);

    expect(state.tabs).toHaveLength(1);
    expect(activeChatTab(state).courseId).toBe(3);
    expect(strip(state)).toEqual(["Capstone Project"]);
  });

  it("gives a genuinely new course its own tab", () => {
    let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
    state = switchChatTabCourse(state, MATH);

    expect(strip(state)).toEqual(["Capstone Project", "Calculus"]);
    expect(activeChatTab(state).courseId).toBe(4);
  });

  it("does nothing when the course is already the active tab's", () => {
    const state = switchChatTabCourse(createChatTabsState(), CAPSTONE);

    expect(switchChatTabCourse(state, CAPSTONE)).toBe(state);
  });

  // Reopen, never duplicate: a course that already has a tab goes back to it.
  it("reopens an existing tab instead of opening a second one", () => {
    let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
    state = switchChatTabCourse(state, MATH);
    const capstoneTabId = state.tabs[0]!.id;

    state = switchChatTabCourse(state, CAPSTONE);

    expect(state.tabs).toHaveLength(2);
    expect(state.activeTabId).toBe(capstoneTabId);
  });

  // The adopt rule and the reopen rule can both apply at once: a course tab
  // exists and the instructor is sitting on an unbound one, which a restored
  // strip can produce. Adopting there would put the same course on two tabs,
  // so the lookup has to run first.
  it("does not adopt a course another tab is already holding", () => {
    // Capstone on a tab, then an unbound tab in front of it.
    let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
    const capstoneTabId = state.activeTabId;
    state = {
      ...state,
      tabs: [
        ...state.tabs,
        {
          id: "unbound",
          courseId: null,
          courseName: null,
          conversationId: null,
          createdSeq: state.nextSeq,
          focusedSeq: state.nextSeq,
        } satisfies ChatTab,
      ],
      activeTabId: "unbound",
      nextSeq: state.nextSeq + 1,
    };

    state = switchChatTabCourse(state, CAPSTONE);

    expect(state.tabs.filter((tab) => tab.courseId === 3)).toHaveLength(1);
    expect(state.activeTabId).toBe(capstoneTabId);
  });

  describe("background opens", () => {
    // The reason focus is a flag at all: an unconfirmed preview in the current
    // tab must survive a course switch. The new tab appears in the strip, the
    // instructor stays where they were -- a background tab, as in a browser.
    it("opens the new course's tab without leaving the current one", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      const capstoneTabId = state.activeTabId;

      state = switchChatTabCourse(state, { ...MATH, focus: false });

      expect(strip(state)).toEqual(["Capstone Project", "Calculus"]);
      expect(state.activeTabId).toBe(capstoneTabId);
      expect(activeChatTab(state).courseId).toBe(3);
    });

    it("leaves the instructor put when the course's tab already exists", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      const mathTabId = state.activeTabId;

      state = switchChatTabCourse(state, { ...CAPSTONE, focus: false });

      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe(mathTabId);
    });
  });

  describe("one tab per course", () => {
    // "+" no longer means "another thread on this course" -- it means the next
    // course that has no tab yet.
    it("opens the first course no tab is holding", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);

      state = openChatTab(state, COURSES);

      expect(strip(state)).toEqual(["Capstone Project", "Calculus"]);
      expect(activeChatTab(state).courseId).toBe(4);
    });

    // Skips over what is open rather than refusing: with Capstone and Calculus
    // taken, "+" is still a live action for World History.
    it("skips courses that already have a tab", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, HISTORY);

      state = openChatTab(state, COURSES);

      expect(strip(state)).toEqual([
        "Capstone Project",
        "World History",
        "Calculus",
      ]);
    });

    // Same reason the first dropdown pick adopts: nothing else ever clears an
    // unbound tab, so "+" leaving one behind leaves it there for good.
    it("binds the launch tab rather than opening beside it", () => {
      const state = openChatTab(createChatTabsState(), COURSES);

      expect(state.tabs).toHaveLength(1);
      expect(strip(state)).toEqual(["Capstone Project"]);
    });

    it("never produces two tabs on one course", () => {
      const state = fillTabs(COURSES);
      const courseIds = state.tabs.map((tab) => tab.courseId);

      expect(courseIds).toEqual([3, 4, 5]);
      expect(new Set(courseIds).size).toBe(courseIds.length);
    });
  });

  describe("limits", () => {
    it("refuses once every course has a tab", () => {
      const state = fillTabs(COURSES);

      expect(openChatTab(state, COURSES)).toBe(state);
      expect(chatTabLimit(state, COURSES)).toEqual({
        kind: "all-courses-open",
        courseCount: 3,
      });
      expect(describeChatTabLimit(chatTabLimit(state, COURSES))).toBe(
        "One tab per course, and all 3 of your courses are already open.",
      );
    });

    // Straight from the spec: three courses against a cap of five means three
    // tabs, and the instructor is told that rather than left guessing.
    it("reports the course count, not the tab cap, when courses run out first", () => {
      const state = fillTabs(COURSES);

      expect(state.tabs).toHaveLength(3);
      expect(state.tabs.length).toBeLessThan(MAX_CHAT_TABS);
    });

    it("uses the singular for an instructor with one course", () => {
      const only = [{ id: 3, name: "Capstone Project" }];
      const state = openChatTab(createChatTabsState(), only);

      expect(describeChatTabLimit(chatTabLimit(state, only))).toBe(
        "One tab per course, and your only course is already open.",
      );
    });

    it("refuses at the tab cap when there are still courses left", () => {
      const state = fillTabs();

      expect(state.tabs).toHaveLength(MAX_CHAT_TABS);
      expect(openChatTab(state, MANY_COURSES)).toBe(state);
      expect(chatTabLimit(state, MANY_COURSES)).toEqual({
        kind: "max-tabs",
        maxTabs: MAX_CHAT_TABS,
      });
      expect(describeChatTabLimit(chatTabLimit(state, MANY_COURSES))).toBe(
        `${MAX_CHAT_TABS} tabs is the maximum. Close one to open another course.`,
      );
    });

    // Both limits are true when the course count equals the cap, but only one
    // of them is useful. "Close a tab to open another course" sends someone
    // looking for a course that does not exist.
    it("prefers the course reason when both limits bite at once", () => {
      const exactly = MANY_COURSES.slice(0, MAX_CHAT_TABS);
      const state = fillTabs(exactly);

      expect(state.tabs).toHaveLength(MAX_CHAT_TABS);
      expect(chatTabLimit(state, exactly)).toEqual({
        kind: "all-courses-open",
        courseCount: MAX_CHAT_TABS,
      });
    });

    it("says so when there are no courses at all", () => {
      const state = createChatTabsState();

      expect(openChatTab(state, [])).toBe(state);
      expect(describeChatTabLimit(chatTabLimit(state, []))).toBe(
        "No courses to open a tab for yet.",
      );
    });

    it("reports the course + would open while one is still free", () => {
      const state = switchChatTabCourse(createChatTabsState(), CAPSTONE);

      expect(chatTabLimit(state, COURSES)).toEqual({
        kind: "available",
        course: { id: 4, name: "Calculus" },
      });
      expect(describeChatTabLimit(chatTabLimit(state, COURSES))).toBeNull();
    });
  });

  describe("capacity", () => {
    // The strip refuses "+", but it cannot refuse a course that has already
    // gone active elsewhere -- Set Active on the dashboard, or the assistant
    // resolving a different course mid-request. Leaving that course without a
    // tab would put the dropdown and the chat on different courses.
    it("still makes room for a course that goes active at the cap", () => {
      const state = fillTabs();

      const next = switchChatTabCourse(state, {
        courseId: 99,
        courseName: "Physics",
      });

      expect(next.tabs).toHaveLength(MAX_CHAT_TABS);
      expect(strip(next).at(-1)).toBe("Physics");
      // The oldest went, not the one in front of the instructor.
      expect(strip(next)).not.toContain("Course 1");
      expect(activeChatTab(next).courseName).toBe("Physics");
    });

    // The active tab is exempt even when it is the oldest. Dropping it would
    // close the thread being read -- and a background open exists precisely to
    // not disturb that thread, so evicting it would defeat the whole point.
    it("evicts the oldest tab that is not the one in front of you", () => {
      let state = fillTabs();
      // Back to the oldest tab, which is now also the active one.
      state = switchChatTabCourse(state, {
        courseId: MANY_COURSES[0]!.id,
        courseName: MANY_COURSES[0]!.name,
      });
      const oldestTabId = state.activeTabId;

      state = switchChatTabCourse(state, {
        courseId: 99,
        courseName: "Physics",
        focus: false,
      });

      expect(state.tabs).toHaveLength(MAX_CHAT_TABS);
      expect(strip(state)).toContain("Course 1");
      expect(strip(state)).not.toContain("Course 2");
      expect(state.activeTabId).toBe(oldestTabId);
    });
  });

  // Two tabs can no longer share a course, but two courses can still share a
  // label: a tab is named with formatInstructorCourseTitle's output, and
  // nothing makes that unique across an instructor's courses.
  it("numbers tabs whose courses happen to read the same", () => {
    let state = switchChatTabCourse(createChatTabsState(), {
      courseId: 3,
      courseName: "Capstone Project",
    });
    state = switchChatTabCourse(state, {
      courseId: 4,
      courseName: "Capstone Project",
    });

    expect(strip(state)).toEqual(["Capstone Project", "Capstone Project (2)"]);
  });

  describe("closing", () => {
    // "If a user really wants a fresh tab, they click +, create a fresh tab,
    // and then close the old one" -- so there is always somewhere to be.
    it("refuses to close the last tab", () => {
      const state = switchChatTabCourse(createChatTabsState(), CAPSTONE);

      expect(closeChatTab(state, state.activeTabId)).toBe(state);
    });

    it("lands on the last-used tab after closing the active one", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      const mathTabId = state.activeTabId;
      state = switchChatTabCourse(state, HISTORY);
      // Visit Calculus so it, not World History, is the most recent.
      state = switchChatTabCourse(state, MATH);
      state = switchChatTabCourse(state, CAPSTONE);
      const capstoneTabId = state.activeTabId;

      state = closeChatTab(state, capstoneTabId);

      expect(state.activeTabId).toBe(mathTabId);
    });

    it("keeps you where you are when closing a background tab", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      const mathTabId = state.activeTabId;

      state = closeChatTab(state, state.tabs[0]!.id);

      expect(state.activeTabId).toBe(mathTabId);
      expect(state.tabs).toHaveLength(1);
    });

    // Closing frees the course, so "+" comes back with that course as its
    // target -- which is the only reason "close one to open another" is honest
    // advice for the tab-cap case.
    it("frees the course it closed for + to reopen", () => {
      let state = fillTabs(COURSES);
      state = closeChatTab(state, state.tabs[1]!.id);

      expect(chatTabLimit(state, COURSES)).toEqual({
        kind: "available",
        course: { id: 4, name: "Calculus" },
      });
    });
  });

  describe("persistence", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("returns null when nothing has been stored", () => {
      expect(loadChatTabs(7)).toBeNull();
    });

    it("restores the strip and the tab you were on", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      state = setChatTabConversation(state, state.activeTabId, 42);
      state = switchChatTabCourse(state, CAPSTONE);
      saveChatTabs(7, state);

      const restored = loadChatTabs(7)!;

      expect(strip(restored)).toEqual(["Capstone Project", "Calculus"]);
      expect(restored.activeTabId).toBe(state.activeTabId);
      expect(restored.tabs[1]!.conversationId).toBe(42);
    });

    // Stored state is only as trustworthy as the last thing that wrote it.
    // A dangling activeTabId would leave no tab reachable at all, so the
    // pointer is re-derived rather than believed.
    it("recovers when the stored active tab is not in the stored tabs", () => {
      const state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      saveChatTabs(7, { ...state, activeTabId: "does-not-exist" });

      const restored = loadChatTabs(7)!;

      expect(restored.tabs).toHaveLength(1);
      expect(restored.activeTabId).toBe(restored.tabs[0]!.id);
    });

    it("keeps issuing fresh sequence numbers after a reload", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      saveChatTabs(7, { ...state, nextSeq: 0 });

      let restored = loadChatTabs(7)!;
      restored = focusChatTab(restored, restored.tabs[0]!.id);

      // A stale counter would hand out a focusedSeq below an existing one,
      // and "most recently used" would start picking the wrong tab.
      expect(restored.tabs[0]!.focusedSeq).toBeGreaterThan(
        restored.tabs[1]!.focusedSeq,
      );
    });

    it("survives unparseable stored state", () => {
      localStorage.setItem("assistant-chat-tabs:7", "{ not json");

      expect(loadChatTabs(7)).toBeNull();
    });

    it("ignores entries that are not tabs", () => {
      localStorage.setItem(
        "assistant-chat-tabs:7",
        JSON.stringify({ tabs: [{ id: 4 }, null, "nope"], activeTabId: "x" }),
      );

      expect(loadChatTabs(7)).toBeNull();
    });

    describe("upgrading a strip stored before one-per-course", () => {
      /** Two tabs on Capstone plus one on Calculus — a strip the previous
       * build produced routinely, and one the current reducers cannot. */
      function storeLegacyStrip(activeTabId: string) {
        localStorage.setItem(
          "assistant-chat-tabs:7",
          JSON.stringify({
            tabs: [
              {
                id: "capstone-old",
                courseId: 3,
                courseName: "Capstone Project",
                conversationId: 11,
                createdSeq: 0,
                focusedSeq: 1,
              },
              {
                id: "capstone-recent",
                courseId: 3,
                courseName: "Capstone Project",
                conversationId: 22,
                createdSeq: 2,
                focusedSeq: 5,
              },
              {
                id: "calculus",
                courseId: 4,
                courseName: "Calculus",
                conversationId: 33,
                createdSeq: 3,
                focusedSeq: 4,
              },
            ],
            activeTabId,
            nextSeq: 6,
          }),
        );
      }

      it("collapses same-course tabs onto the one last used", () => {
        storeLegacyStrip("calculus");

        const restored = loadChatTabs(7)!;

        expect(restored.tabs.map((tab) => tab.id)).toEqual([
          "capstone-recent",
          "calculus",
        ]);
        // The thread they were actually in, not whichever came first.
        expect(restored.tabs[0]!.conversationId).toBe(22);
      });

      // The dropped tab was the one in front of them. Landing on the tab that
      // absorbed it keeps them on the course they had open; falling through to
      // the end of the strip would move them to a different course on reload.
      it("lands on the surviving tab for the course they were on", () => {
        storeLegacyStrip("capstone-old");

        const restored = loadChatTabs(7)!;

        expect(restored.activeTabId).toBe("capstone-recent");
      });

      it("collapses duplicate unbound tabs too", () => {
        localStorage.setItem(
          "assistant-chat-tabs:7",
          JSON.stringify({
            tabs: [
              {
                id: "blank-a",
                courseId: null,
                courseName: null,
                conversationId: null,
                createdSeq: 0,
                focusedSeq: 0,
              },
              {
                id: "blank-b",
                courseId: null,
                courseName: null,
                conversationId: null,
                createdSeq: 1,
                focusedSeq: 1,
              },
            ],
            activeTabId: "blank-b",
            nextSeq: 2,
          }),
        );

        expect(loadChatTabs(7)!.tabs.map((tab) => tab.id)).toEqual(["blank-b"]);
      });
    });
  });
});
