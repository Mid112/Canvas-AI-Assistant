import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatTabStrip } from "@/components/chat/ChatTabStrip";
import {
  MAX_CHAT_TABS,
  chatTabLimit,
  createChatTabsState,
  openChatTab,
  switchChatTabCourse,
  type ChatTabLimit,
  type ChatTabsState,
} from "@/lib/chat-tabs";

const COURSES = [
  { id: 3, name: "Capstone Project" },
  { id: 4, name: "Calculus" },
  { id: 5, name: "World History" },
];

/** Built through the real reducers, so the strip is always rendering a state
 * the rules can actually produce. */
function threeCourses(): ChatTabsState {
  let state = switchChatTabCourse(createChatTabsState(), {
    courseId: 3,
    courseName: "Capstone Project",
  });
  state = switchChatTabCourse(state, { courseId: 4, courseName: "Calculus" });
  state = switchChatTabCourse(state, {
    courseId: 5,
    courseName: "World History",
  });
  return state;
}

function renderStrip(
  state: ChatTabsState,
  handlers: Partial<{
    limit: ChatTabLimit;
    onFocus: (id: string) => void;
    onClose: (id: string) => void;
    onNew: () => void;
  }> = {},
) {
  const onFocus = handlers.onFocus ?? vi.fn();
  const onClose = handlers.onClose ?? vi.fn();
  const onNew = handlers.onNew ?? vi.fn();

  render(
    <ChatTabStrip
      tabs={state.tabs}
      activeTabId={state.activeTabId}
      limit={handlers.limit ?? chatTabLimit(state, COURSES)}
      onFocus={onFocus}
      onClose={onClose}
      onNew={onNew}
    />,
  );

  return { onFocus, onClose, onNew };
}

describe("ChatTabStrip", () => {
  it("names each tab after its course and marks the active one", () => {
    const state = threeCourses();
    renderStrip(state);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Capstone Project",
      "Calculus",
      "World History",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent(
      "World History",
    );
  });

  it("reports which tab was clicked", async () => {
    const user = userEvent.setup();
    const state = threeCourses();
    const { onFocus } = renderStrip(state);

    await user.click(screen.getByRole("tab", { name: "Calculus" }));

    expect(onFocus).toHaveBeenCalledWith(state.tabs[1]!.id);
  });

  it("closes the tab whose x was clicked, not the active one", async () => {
    const user = userEvent.setup();
    const state = threeCourses();
    const { onClose, onFocus } = renderStrip(state);

    await user.click(screen.getByRole("button", { name: "Close Calculus" }));

    expect(onClose).toHaveBeenCalledWith(state.tabs[1]!.id);
    // Closing a background tab must not also select it on the way out.
    expect(onFocus).not.toHaveBeenCalled();
  });

  // Closing the last tab is impossible, so the control is absent rather than
  // present-and-dead. "+" remains, which is the actual route to a fresh start.
  it("offers no close control when only one tab is open", () => {
    const state = switchChatTabCourse(createChatTabsState(), {
      courseId: 3,
      courseName: "Capstone Project",
    });
    renderStrip(state);

    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Close / })).toBeNull();
    expect(
      screen.getByRole("button", { name: "New chat tab" }),
    ).toBeInTheDocument();
  });

  it("asks for a new tab when + is clicked", async () => {
    const user = userEvent.setup();
    const state = switchChatTabCourse(createChatTabsState(), {
      courseId: 3,
      courseName: "Capstone Project",
    });
    const { onNew } = renderStrip(state);

    await user.click(screen.getByRole("button", { name: "New chat tab" }));

    expect(onNew).toHaveBeenCalledTimes(1);
  });

  describe("when + cannot open anything", () => {
    // The requirement this whole prop exists for: a "+" that does nothing has
    // to say why, because the two ways of running out have different answers
    // and a greyed-out button tells you neither.
    it("shows the reason and stops responding to clicks", async () => {
      const user = userEvent.setup();
      // All three courses open, so there is nothing left to open a tab on.
      const { onNew } = renderStrip(threeCourses());

      expect(
        screen.getByText(
          "One tab per course, and all 3 of your courses are already open.",
        ),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "New chat tab" }));

      expect(onNew).not.toHaveBeenCalled();
    });

    it("distinguishes the tab cap from running out of courses", () => {
      renderStrip(threeCourses(), {
        limit: { kind: "max-tabs", maxTabs: MAX_CHAT_TABS },
      });

      expect(
        screen.getByText(
          `${MAX_CHAT_TABS} tabs is the maximum. Close one to open another course.`,
        ),
      ).toBeInTheDocument();
    });

    // aria-disabled rather than disabled: a `disabled` button leaves the focus
    // order, so a screen reader never reaches the note explaining it -- the one
    // group of users who cannot simply read it off the strip.
    it("keeps the button reachable and attaches the reason to it", () => {
      renderStrip(threeCourses());

      const button = screen.getByRole("button", { name: "New chat tab" });

      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAccessibleDescription(
        "One tab per course, and all 3 of your courses are already open.",
      );
    });

    it("says nothing while + still has a course to open", () => {
      let state = switchChatTabCourse(createChatTabsState(), {
        courseId: 3,
        courseName: "Capstone Project",
      });
      state = openChatTab(state, COURSES);
      renderStrip(state);

      const button = screen.getByRole("button", { name: "New chat tab" });

      expect(button).toHaveAttribute("aria-disabled", "false");
      expect(button).not.toHaveAccessibleDescription();
      expect(screen.queryByText(/One tab per course/)).toBeNull();
    });
  });

  // The tab open before any course is picked still needs a name.
  it("labels a tab with no course yet", () => {
    renderStrip(createChatTabsState());

    expect(screen.getByRole("tab")).toHaveTextContent("New chat");
  });

  // "+" opens a tab rather than being one. Inside the tablist a screen reader
  // would announce it as a fourth tab that cannot be selected.
  it("keeps the new-tab button out of the tab list", () => {
    renderStrip(threeCourses());

    const tablist = screen.getByRole("tablist", { name: "Chat tabs" });

    expect(tablist).not.toContainElement(
      screen.getByRole("button", { name: "New chat tab" }),
    );
  });
});
