import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_CHAT_TABS,
  activeChatTab,
  chatTabLabels,
  closeChatTab,
  createChatTabsState,
  focusChatTab,
  loadChatTabs,
  openChatTab,
  saveChatTabs,
  setChatTabConversation,
  switchChatTabCourse,
  type ChatTabsState,
} from "@/lib/chat-tabs";

const CAPSTONE = { courseId: 3, courseName: "Capstone Project" };
const MATH = { courseId: 4, courseName: "Calculus" };
const HISTORY = { courseId: 5, courseName: "World History" };

/** Course names in strip order — what the instructor actually sees. */
function strip(state: ChatTabsState): string[] {
  const labels = chatTabLabels(state.tabs);
  return state.tabs.map((tab) => labels.get(tab.id)!);
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

  describe("capacity", () => {
    it("never holds more than the cap", () => {
      let state = createChatTabsState();
      for (let index = 0; index < MAX_CHAT_TABS + 3; index += 1) {
        state = openChatTab(state, { courseName: `Course ${index}` });
      }

      expect(state.tabs).toHaveLength(MAX_CHAT_TABS);
    });

    it("evicts the oldest tab to make room", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      state = switchChatTabCourse(state, HISTORY);

      state = openChatTab(state, { courseId: 6, courseName: "Physics" });

      expect(strip(state)).toEqual(["Calculus", "World History", "Physics"]);
    });

    // The active tab is exempt even when it is the oldest. Dropping it would
    // close the thread being read -- and a background open exists precisely to
    // not disturb that thread, so evicting it would defeat the whole point.
    it("evicts the oldest tab that is not the one in front of you", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = switchChatTabCourse(state, MATH);
      state = switchChatTabCourse(state, HISTORY);
      // Back to the oldest tab, which is now also the active one.
      state = switchChatTabCourse(state, CAPSTONE);
      const capstoneTabId = state.activeTabId;

      state = switchChatTabCourse(state, {
        courseId: 6,
        courseName: "Physics",
        focus: false,
      });

      expect(strip(state)).toEqual([
        "Capstone Project",
        "World History",
        "Physics",
      ]);
      expect(state.activeTabId).toBe(capstoneTabId);
    });
  });

  describe("several tabs on one course", () => {
    // Straight from the spec: tabs 1 and 2 on course A, sitting on tab 3.
    // Switching back to A picks tab 2 -- the one last used -- and leaves tab 1
    // a click away rather than guessing at it.
    it("reopens the most recently used of them", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = openChatTab(state, CAPSTONE);
      const secondCapstoneId = state.activeTabId;
      state = switchChatTabCourse(state, MATH);

      state = switchChatTabCourse(state, CAPSTONE);

      expect(state.activeTabId).toBe(secondCapstoneId);
    });

    it("numbers the duplicates so the strip stays readable", () => {
      let state = switchChatTabCourse(createChatTabsState(), CAPSTONE);
      state = openChatTab(state, CAPSTONE);
      state = openChatTab(state, CAPSTONE);

      expect(strip(state)).toEqual([
        "Capstone Project",
        "Capstone Project (2)",
        "Capstone Project (3)",
      ]);
    });
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
  });
});
