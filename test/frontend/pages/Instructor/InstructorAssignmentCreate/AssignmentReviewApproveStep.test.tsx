import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { AssignmentReviewApproveStep } from "@/pages/Instructor/InstructorAssignmentCreate/AssignmentReviewApproveStep";

// Regression (Ticket 43 / #1504): react-hook-form's bare `useWatch({ control })`
// can report a field as `undefined` for a render or two before its subscription
// settles. Real timing for that race isn't reliable to force in jsdom, so this
// mock reproduces it deterministically: the very first bare (no `name`) watch
// read for each mounted form comes back with `dueDate` stripped, exactly like
// an unsettled watch would.
vi.mock("react-hook-form", async () => {
  const actual =
    await vi.importActual<typeof import("react-hook-form")>("react-hook-form");
  return {
    ...actual,
    useWatch: (options?: { name?: string } & Record<string, unknown>) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- this wrapper *is* the hook.
      const result = actual.useWatch(options as never);
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const hasSettledRef = useRef(false);
      const isBareWatch = !options?.name;
      if (isBareWatch && !hasSettledRef.current) {
        hasSettledRef.current = true;
        return { ...(result as object), dueDate: undefined };
      }
      return result;
    },
  };
});

const draft = {
  name: "Python Functions Quiz",
  description: "Complete a short quiz covering functions.",
  dueDate: "2026-12-15T23:59",
  pointsPossible: 50,
};

describe("AssignmentReviewApproveStep", () => {
  // Verifies: Renders title, description, and due date fields.
  it("renders title, description, and due date fields", () => {
    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Assignment title")).toHaveValue(
      "Python Functions Quiz",
    );
    expect(screen.getByLabelText("Assignment description")).toHaveValue(
      "Complete a short quiz covering functions.",
    );
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-12-15T23:59");
    expect(screen.getByLabelText("Points possible")).toHaveValue(50);
  });

  it("validates empty title on approve", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    await user.clear(screen.getByLabelText("Assignment title"));
    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    expect(await screen.findByText(/Title cannot be empty/)).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it("lets the instructor edit points possible and submits the new value", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    const pointsField = screen.getByLabelText("Points possible");
    await user.clear(pointsField);
    await user.type(pointsField, "75");
    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledWith(
        expect.objectContaining({ pointsPossible: 75 }),
        expect.anything(),
      );
    });
  });

  it("rejects zero or negative points possible on approve", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    const pointsField = screen.getByLabelText("Points possible");
    await user.clear(pointsField);
    await user.type(pointsField, "0");
    await user.click(screen.getByRole("button", { name: "Approve Assignment" }));

    expect(
      await screen.findByText(/Points possible must be greater than 0/),
    ).toBeInTheDocument();
    expect(onApprove).not.toHaveBeenCalled();
  });

  // Verifies: Regression (Ticket 43 / #1504) — the onDraftChange sync used to
  // fall back to an empty string whenever the watched field hadn't settled
  // yet, wiping the parent draft's due date before the instructor ever saved.
  // Quiz already fell back to draft.dueDate; assignment must match.
  it("never reports an empty due date while the draft already has one", async () => {
    const onDraftChange = vi.fn();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={vi.fn()}
        onBack={vi.fn()}
        onDraftChange={onDraftChange}
      />,
    );

    await waitFor(() => {
      expect(onDraftChange).toHaveBeenCalled();
    });

    for (const call of onDraftChange.mock.calls) {
      const [values] = call as [{ dueDate: string }];
      expect(values.dueDate).toBe(draft.dueDate);
    }
  });

  // Verifies: Disables approve when the form is invalid.
  it("disables approve when the form is invalid", async () => {
    const user = userEvent.setup();

    render(
      <AssignmentReviewApproveStep
        courseLabel="CS 101"
        draft={draft}
        isApproving={false}
        onApprove={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "Approve Assignment" }),
    ).toBeEnabled();

    await user.clear(screen.getByLabelText("Assignment title"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Approve Assignment" }),
      ).toBeDisabled();
    });
  });
});
