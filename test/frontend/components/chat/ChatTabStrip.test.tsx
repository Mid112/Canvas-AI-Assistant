import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatTabStrip } from "@/components/chat/ChatTabStrip";
import {
  createChatTabsState,
  openChatTab,
  switchChatTabCourse,
  type ChatTabsState,
} from "@/lib/chat-tabs";

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

  // At the cap, "+" retires the oldest tab rather than refusing -- so a
  // disabled button here would block a supported action.
  it("keeps the new-tab button available at the cap", () => {
    const { onNew } = renderStrip(threeCourses());

    expect(screen.getByRole("button", { name: "New chat tab" })).toBeEnabled();
    expect(onNew).not.toHaveBeenCalled();
  });

  it("asks for a new tab when + is clicked", async () => {
    const user = userEvent.setup();
    const { onNew } = renderStrip(threeCourses());

    await user.click(screen.getByRole("button", { name: "New chat tab" }));

    expect(onNew).toHaveBeenCalledTimes(1);
  });

  // Two tabs on one course would otherwise render the same word twice, and
  // the close buttons would be indistinguishable by name too.
  it("distinguishes two tabs that share a course", () => {
    let state = switchChatTabCourse(createChatTabsState(), {
      courseId: 3,
      courseName: "Capstone Project",
    });
    state = openChatTab(state, { courseId: 3, courseName: "Capstone Project" });
    renderStrip(state);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Capstone Project",
      "Capstone Project (2)",
    ]);
    expect(
      screen.getByRole("button", { name: "Close Capstone Project (2)" }),
    ).toBeInTheDocument();
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
