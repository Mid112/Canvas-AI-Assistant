import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DraftWorkspacePanel } from "@/components/chat/DraftWorkspacePanel";
import type { TypedDraft } from "@/lib/typed-draft-storage";

function makeTypedDraft(id: string): TypedDraft {
  return {
    id,
    kind: "assignment",
    content: { title: `Draft ${id}`, body: "Some description" },
    savedAt: "2026-07-01T12:00:00.000Z",
  };
}

function renderPanel(typedDrafts: TypedDraft[], overrides = {}) {
  return render(
    <DraftWorkspacePanel
      items={[]}
      typedDrafts={typedDrafts}
      onResume={vi.fn()}
      onDiscard={vi.fn()}
      onResumeTypedDraft={vi.fn()}
      onDiscardTypedDraft={vi.fn()}
      {...overrides}
    />,
  );
}

describe("DraftWorkspacePanel", () => {
  // Verifies: Regression (#1, #10) — the panel starts collapsed so it can't
  // crowd out the chat window, while still surfacing the draft count.
  it("collapses by default and shows only the draft count", () => {
    renderPanel([makeTypedDraft("1"), makeTypedDraft("2")]);

    const toggle = screen.getByRole("button", { name: /Saved drafts \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Draft 1")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Resume" }),
    ).not.toBeInTheDocument();
  });

  it("reveals the drafts list when expanded", async () => {
    const user = userEvent.setup();
    renderPanel([makeTypedDraft("1")]);

    await user.click(screen.getByRole("button", { name: /Saved drafts \(1\)/ }));

    expect(screen.getByText("Draft 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });

  // Verifies: Regression (#10) — even expanded, the list is capped and scrolls
  // internally so it can never grow unbounded and squeeze the chat window's
  // message input off-screen, no matter how many drafts are saved.
  it("caps the expanded drafts list height and scrolls internally", async () => {
    const user = userEvent.setup();
    const manyDrafts = Array.from({ length: 12 }, (_, i) => makeTypedDraft(String(i)));
    renderPanel(manyDrafts);

    await user.click(screen.getByRole("button", { name: /Saved drafts \(12\)/ }));

    const list = screen.getByText("Draft 0").closest("ul");
    expect(list).toHaveClass("max-h-64", "overflow-y-auto");
  });

  // Verifies: Regression (#10) — the panel doesn't get flex-shrunk by its
  // siblings, which is what previously let it eat the chat window's budget.
  it("keeps the panel from being flex-shrunk by its siblings", () => {
    renderPanel([makeTypedDraft("1")]);

    expect(
      screen.getByRole("button", { name: /Saved drafts \(1\)/ }).closest("section"),
    ).toHaveClass("shrink-0");
  });

  it("resumes and discards a typed draft", async () => {
    const user = userEvent.setup();
    const onResumeTypedDraft = vi.fn();
    const onDiscardTypedDraft = vi.fn();

    renderPanel([makeTypedDraft("1")], {
      onResumeTypedDraft,
      onDiscardTypedDraft,
    });

    await user.click(screen.getByRole("button", { name: /Saved drafts \(1\)/ }));

    await user.click(screen.getByRole("button", { name: "Resume" }));
    expect(onResumeTypedDraft).toHaveBeenCalledWith("1");

    await user.click(screen.getByRole("button", { name: /Discard/ }));
    expect(onDiscardTypedDraft).toHaveBeenCalledWith("1");
  });
});
