import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import { WorkflowHistoryPage } from "@/pages/Instructor/WorkflowHistoryPage";
import * as workflowHistoryService from "@/services/workflowHistory";
import { renderWithRouter } from "@test/utils/renderWithRouter";

function mockWorkflowHistoryResult(
  entries: typeof mockWorkflowHistory = mockWorkflowHistory,
) {
  return { entries, total: entries.length };
}

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

describe("WorkflowHistoryPage", () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      accessToken: "access-token",
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValue(
      mockWorkflowHistoryResult(),
    );
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  }

  // #484 — Create history page
  // Verifies: Renders the workflow history page with heading and description.
  it("renders the workflow history page with heading and description", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(
      screen.getByRole("heading", { name: "Workflow Audit Log" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Track all AI-generated workflow actions."),
    ).toBeInTheDocument();
  });

  // #485 — Display previous actions
  // Verifies: Displays previous workflow actions in a table.
  it("displays previous workflow actions in a table", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getAllByText("Send Reminder Emails").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create Assignment").length).toBeGreaterThan(0);
    expect(screen.getByText("Bulk Grade Update")).toBeInTheDocument();
    expect(screen.getByText("Generate Announcement")).toBeInTheDocument();
  });

  // #486 — Display timestamps
  // Verifies: Shows timestamps for each workflow entry.
  it("shows timestamps for each workflow entry", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    const timestampCells = screen.getAllByText(/2026-05-\d{2}/);
    expect(timestampCells.length).toBeGreaterThanOrEqual(
      mockWorkflowHistory.length,
    );
  });

  // #487 — Add search/filter support
  // Verifies: Filters workflow history by search query.
  it("filters workflow history by search query", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.type(
      screen.getByLabelText("Search workflows"),
      "Bulk Grade",
    );

    expect(screen.getByText("Bulk Grade Update")).toBeInTheDocument();
    expect(
      screen.queryByText("Generate Announcement"),
    ).not.toBeInTheDocument();
  });

  // Verifies: Filters workflow history by status.
  it("filters workflow history by status", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "Rejected" }));

    expect(screen.getByText("Bulk Grade Update")).toBeInTheDocument();
    expect(
      screen.queryByText("Generate Announcement"),
    ).not.toBeInTheDocument();
  });

  // #488 — Display execution status
  // Verifies: Shows status badges (Approved, Rejected, Pending) for entries.
  it("shows status badges (Approved, Rejected, Pending) for entries", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

  // Verifies: Displays status summary cards with counts at the bottom.
  it("displays status summary cards with counts at the bottom", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    const approved = mockWorkflowHistory.filter(
      (e) => e.status === "approved",
    ).length;
    const rejected = mockWorkflowHistory.filter(
      (e) => e.status === "rejected",
    ).length;
    const pending = mockWorkflowHistory.filter(
      (e) => e.status === "pending",
    ).length;

    expect(screen.getByText(String(approved))).toBeInTheDocument();
    expect(screen.getByText(String(rejected))).toBeInTheDocument();
    expect(screen.getByText(String(pending))).toBeInTheDocument();
  });

  // #489 — Display previous requests (workflow descriptions / details)
  // Verifies: Shows workflow descriptions for each entry.
  it("shows workflow descriptions for each entry", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(
      screen.getByText(/Send reminder emails to students with missing/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Array Manipulation and Sorting Algorithms/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/update grades for Quiz 2/),
    ).toBeInTheDocument();
  });

  // Verifies: Exports workflow history as CSV.
  it("exports workflow history as CSV", async () => {
    const downloadSpy = vi
      .spyOn(workflowHistoryService, "downloadWorkflowHistoryCsv")
      .mockImplementation(() => {});

    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "Export Log" }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0].length).toBe(
      mockWorkflowHistory.length,
    );

    downloadSpy.mockRestore();
  });

  // Verifies: Shows a load error with retry.
  it("shows a load error with retry", async () => {
    vi.spyOn(
      workflowHistoryService,
      "fetchWorkflowHistory",
    ).mockRejectedValueOnce(new Error("Network error"));

    renderWithRouter(<WorkflowHistoryPage />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Unable to load workflow history. Please try again.",
    );

    const retrySpy = vi
      .spyOn(workflowHistoryService, "fetchWorkflowHistory")
      .mockResolvedValueOnce(mockWorkflowHistoryResult([]));

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalled();
    });
  });

  // Verifies: Shows empty state when no workflows match.
  it("shows empty state when no workflows match", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.type(
      screen.getByLabelText("Search workflows"),
      "nonexistent workflow xyz",
    );

    expect(
      screen.getByText("No workflow history found."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Export Log" }),
    ).toBeDisabled();
  });

  // Verifies: Shows user names in the table.
  it("shows user names in the table", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(
      screen.getAllByText("Dr. Jane Doe").length,
    ).toBeGreaterThan(0);
  });

  // Verifies: Paginates when more entries than page size.
  it("paginates when more entries than page size", async () => {
    const manyEntries = Array.from({ length: 12 }, (_, index) => ({
      ...mockWorkflowHistory[0]!,
      id: `wh-pag-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      workflowName: `Workflow ${index}`,
    }));

    vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(
      mockWorkflowHistoryResult(manyEntries),
    );

    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  // Verifies: Clears active filters.
  it("clears active filters", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.type(
      screen.getByLabelText("Search workflows"),
      "Bulk Grade",
    );
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Send Reminder Emails").length).toBeGreaterThan(0);
  });

  // Verifies: Exports all filtered entries across pages.
  it("exports all filtered entries across pages", async () => {
    const manyEntries = Array.from({ length: 12 }, (_, index) => ({
      ...mockWorkflowHistory[0]!,
      id: `wh-exp-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      workflowName: `Workflow ${index}`,
    }));

    vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(
      mockWorkflowHistoryResult(manyEntries),
    );
    const downloadSpy = vi
      .spyOn(workflowHistoryService, "downloadWorkflowHistoryCsv")
      .mockImplementation(() => {});

    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Export Log" }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toHaveLength(12);

    downloadSpy.mockRestore();
  });

  describe("reversal", () => {
    const undoableEntry = {
      ...mockWorkflowHistory[0]!,
      id: "wh-undoable",
      workflowName: "Update Assignment",
      status: "approved" as const,
      undoable: true,
      undoneAt: null,
    };

    // Verifies: No Reverse button is shown for non-reversible or already-reversed entries.
    it("does not show a Reverse button for non-reversible entries", async () => {
      renderWithRouter(<WorkflowHistoryPage />);

      await waitForLoaded();

      expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
    });

    // Verifies: Clicking Reverse opens a confirmation dialog.
    it("shows a confirmation dialog before reversing", async () => {
      vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(
        mockWorkflowHistoryResult([undoableEntry]),
      );

      renderWithRouter(<WorkflowHistoryPage />);
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Reverse" }));

      expect(
        screen.getByRole("heading", { name: "Reverse this action" }),
      ).toBeInTheDocument();
    });

    // Verifies: Confirming reversal calls the service and refreshes the list.
    it("reverses the workflow and shows a success toast", async () => {
      vi.spyOn(workflowHistoryService, "fetchWorkflowHistory")
        .mockResolvedValueOnce(mockWorkflowHistoryResult([undoableEntry]))
        .mockResolvedValueOnce(
          mockWorkflowHistoryResult([{ ...undoableEntry, undoneAt: "2026-06-01T00:00:00.000Z" }]),
        );
      const reverseSpy = vi
        .spyOn(workflowHistoryService, "reverseWorkflow")
        .mockResolvedValue({ ...undoableEntry, undoneAt: "2026-06-01T00:00:00.000Z" });

      renderWithRouter(<WorkflowHistoryPage />);
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Reverse" }));
      await user.click(screen.getByRole("button", { name: "Reverse action" }));

      await waitFor(() => {
        expect(reverseSpy).toHaveBeenCalledWith("access-token", "wh-undoable");
      });
      expect(
        await screen.findByText('"Update Assignment" was reversed.'),
      ).toBeInTheDocument();
    });

    // Verifies: A failed reversal shows the backend's actionable error text.
    it("shows an error toast with the backend's detail text when reversal fails", async () => {
      vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(
        mockWorkflowHistoryResult([undoableEntry]),
      );
      vi.spyOn(workflowHistoryService, "reverseWorkflow").mockRejectedValue(
        new workflowHistoryService.WorkflowHistoryApiError(
          "This action has already been undone.",
          409,
        ),
      );

      renderWithRouter(<WorkflowHistoryPage />);
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Reverse" }));
      await user.click(screen.getByRole("button", { name: "Reverse action" }));

      expect(
        await screen.findByText("This action has already been undone."),
      ).toBeInTheDocument();
    });

    // Verifies: Reversing a create_assignment shows delete-specific, more severe copy.
    it("shows delete-specific confirmation copy for reversing a create_assignment", async () => {
      const createEntry = {
        ...undoableEntry,
        id: "wh-create-undoable",
        actionName: "create_assignment",
        workflowName: "Create Assignment",
      };
      vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(
        mockWorkflowHistoryResult([createEntry]),
      );

      renderWithRouter(<WorkflowHistoryPage />);
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Reverse" }));

      expect(
        screen.getByRole("heading", { name: "Delete this assignment" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/permanently deletes the assignment from Canvas/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Delete assignment" }),
      ).toBeInTheDocument();
    });

    // Verifies: Reversing a create_assignment shows a delete-specific success toast.
    it("shows a delete-specific success toast after reversing a create_assignment", async () => {
      const createEntry = {
        ...undoableEntry,
        id: "wh-create-undoable",
        actionName: "create_assignment",
        workflowName: "Create Assignment",
      };
      vi.spyOn(workflowHistoryService, "fetchWorkflowHistory")
        .mockResolvedValueOnce(mockWorkflowHistoryResult([createEntry]))
        .mockResolvedValueOnce(
          mockWorkflowHistoryResult([{ ...createEntry, undoneAt: "2026-06-01T00:00:00.000Z" }]),
        );
      vi.spyOn(workflowHistoryService, "reverseWorkflow").mockResolvedValue({
        ...createEntry,
        undoneAt: "2026-06-01T00:00:00.000Z",
      });

      renderWithRouter(<WorkflowHistoryPage />);
      await waitForLoaded();

      await user.click(screen.getByRole("button", { name: "Reverse" }));
      await user.click(screen.getByRole("button", { name: "Delete assignment" }));

      expect(
        await screen.findByText(/the assignment was deleted/i),
      ).toBeInTheDocument();
    });
  });
});
