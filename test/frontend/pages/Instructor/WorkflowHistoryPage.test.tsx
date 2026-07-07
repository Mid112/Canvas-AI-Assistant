import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import { WorkflowHistoryPage } from "@/pages/Instructor/WorkflowHistoryPage";
import * as workflowHistoryService from "@/services/workflowHistory";
import { renderWithRouter } from "@test/utils/renderWithRouter";

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
      mockWorkflowHistory,
    );
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  }

  // #484 — Create history page
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
  it("displays previous workflow actions in a table", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getAllByText("Send Reminder Emails").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create Assignment").length).toBeGreaterThan(0);
    expect(screen.getByText("Bulk Grade Update")).toBeInTheDocument();
    expect(screen.getByText("Generate Announcement")).toBeInTheDocument();
  });

  // #486 — Display timestamps
  it("shows timestamps for each workflow entry", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    const timestampCells = screen.getAllByText(/2026-05-\d{2}/);
    expect(timestampCells.length).toBeGreaterThanOrEqual(
      mockWorkflowHistory.length,
    );
  });

  // #487 — Add search/filter support
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
  it("shows status badges (Approved, Rejected, Pending) for entries", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getAllByText("Approved").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rejected").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
  });

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
      .mockResolvedValueOnce([]);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalled();
    });
  });

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

  it("shows user names in the table", async () => {
    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(
      screen.getAllByText("Dr. Jane Doe").length,
    ).toBeGreaterThan(0);
  });

  it("paginates when more entries than page size", async () => {
    const manyEntries = Array.from({ length: 12 }, (_, index) => ({
      ...mockWorkflowHistory[0]!,
      id: `wh-pag-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      workflowName: `Workflow ${index}`,
    }));

    vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(manyEntries);

    renderWithRouter(<WorkflowHistoryPage />);

    await waitForLoaded();

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

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

  it("exports all filtered entries across pages", async () => {
    const manyEntries = Array.from({ length: 12 }, (_, index) => ({
      ...mockWorkflowHistory[0]!,
      id: `wh-exp-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      workflowName: `Workflow ${index}`,
    }));

    vi.spyOn(workflowHistoryService, "fetchWorkflowHistory").mockResolvedValueOnce(manyEntries);
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
});
