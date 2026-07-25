import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { paths } from "@/routes/paths";
import { FailedOperationsPage } from "@/pages/Admin/FailedOperationsPage";
import * as failedOperationsService from "@/services/failedOperations";
import * as supportTicketsService from "@/services/supportTickets";
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

const summary: failedOperationsService.FailedOperationSummaryResponse = {
  total: 3,
  canvas_count: 2,
  ai_count: 1,
  hours: 24,
};

// List shape: metadata + human_summary only, no raw error_detail/context_json
// (see FailedOperationDetail below for the gated detail shape).
const items: failedOperationsService.FailedOperation[] = [
  {
    id: 1,
    source: "canvas",
    operation: "fetch_assignments",
    user_id: 10,
    user_name: "Jane Doe",
    course_id: 5,
    conversation_id: 20,
    workflow_id: null,
    tool_call_id: 99,
    provider: null,
    human_summary: "Canvas couldn't fetch assignments.",
    created_at: "2026-07-21T18:00:00Z",
  },
  {
    id: 2,
    source: "ai",
    operation: "assistant_chat",
    user_id: 11,
    user_name: "John Smith",
    course_id: null,
    conversation_id: 21,
    workflow_id: null,
    tool_call_id: null,
    provider: "openai",
    human_summary: "The AI assistant couldn't complete this request.",
    created_at: "2026-07-21T17:00:00Z",
  },
];

const details: Record<number, failedOperationsService.FailedOperationDetail> = {
  1: {
    ...items[0],
    error_detail: "Canvas 401 Unauthorized",
    context_json: { canvas_connection_id: 3 },
  },
  2: {
    ...items[1],
    error_detail: "LLM request timed out after 60s",
    context_json: {},
  },
};

describe("FailedOperationsPage", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      accessToken: "access-token",
      user: { email: "admin@system.local", role: "admin" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(failedOperationsService, "fetchFailedOperationsSummary").mockResolvedValue(summary);
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items,
      total: items.length,
      canvas_count: 2,
      ai_count: 1,
    });
    vi.spyOn(failedOperationsService, "fetchFailedOperation").mockImplementation(
      async (_token, id) => details[id],
    );
    // No ticket exists by default — TicketPanel is mounted for every
    // selected item, so this must be stubbed for every test.
    vi.spyOn(supportTicketsService, "fetchTicketForFailedOperation").mockResolvedValue(null);
    vi.spyOn(supportTicketsService, "createTicket");
    vi.spyOn(supportTicketsService, "updateTicket");
  });

  it("renders summary cards and the failure list", async () => {
    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed Operations")).toBeInTheDocument();
    });

    expect(screen.getByText("Total failures")).toBeInTheDocument();
    expect(screen.getByText("Canvas failures")).toBeInTheDocument();
    expect(screen.getByText("AI failures")).toBeInTheDocument();
    expect(screen.getAllByText("Canvas couldn't fetch assignments.").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("The AI assistant couldn't complete this request.").length,
    ).toBeGreaterThan(0);
  });

  it("links back to Troubleshooting", async () => {
    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed Operations")).toBeInTheDocument();
    });

    const backLink = screen.getByRole("link", { name: /back to troubleshooting/i });
    expect(backLink).toHaveAttribute("href", paths.admin.troubleshooting);
  });

  it("filters the list when a source tab is selected", async () => {
    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("fetch_assignments")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "AI" }));

    await waitFor(() => {
      expect(failedOperationsService.fetchFailedOperations).toHaveBeenLastCalledWith(
        "access-token",
        expect.objectContaining({ source: "ai" }),
      );
    });
  });

  it("shows an error state when loading fails", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperationsSummary").mockRejectedValueOnce(
      new Error("network error"),
    );

    renderWithRouter(<FailedOperationsPage />);

    expect(await screen.findByText("Unable to load failed operations.")).toBeInTheDocument();
  });

  it("shows an empty state when there are no failures", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items: [],
      total: 0,
      canvas_count: 0,
      ai_count: 0,
    });
    vi.spyOn(failedOperationsService, "fetchFailedOperationsSummary").mockResolvedValue({
      total: 0,
      canvas_count: 0,
      ai_count: 0,
      hours: 24,
    });

    renderWithRouter(<FailedOperationsPage />);

    expect(
      await screen.findByText("No failed operations in the last 24 hours."),
    ).toBeInTheDocument();
    expect(screen.getByText("Select a failed operation to view details.")).toBeInTheDocument();
  });

  it("loads detail context when a list item is selected", async () => {
    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("fetch_assignments")).toBeInTheDocument();
    });

    await user.click(screen.getByText("assistant_chat"));

    await waitFor(() => {
      expect(failedOperationsService.fetchFailedOperation).toHaveBeenCalledWith(
        "access-token",
        2,
      );
    });

    expect(await screen.findByText("Provider: openai")).toBeInTheDocument();
    expect(screen.getByText("User: John Smith")).toBeInTheDocument();
    expect(screen.getByText("LLM request timed out after 60s")).toBeInTheDocument();
  });

  it("shows a Load more control when more failures exist than were fetched", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items,
      total: 5,
      canvas_count: 3,
      ai_count: 2,
    });

    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });
  });

  it("offers to escalate to a ticket when none exists, and creates one on click", async () => {
    vi.spyOn(supportTicketsService, "createTicket").mockResolvedValue({
      id: 42,
      failed_operation_id: 1,
      user_id: 10,
      user_name: "Jane Doe",
      status: "open",
      admin_notes: null,
      created_by: 1,
      created_by_email: "admin@system.local",
      resolved_by: null,
      resolved_by_email: null,
      created_at: "2026-07-21T18:05:00Z",
      resolved_at: null,
    });

    renderWithRouter(<FailedOperationsPage />);

    await user.click(await screen.findByText("fetch_assignments"));

    const escalateButton = await screen.findByRole("button", { name: "Escalate to ticket" });
    await user.click(escalateButton);

    await waitFor(() => {
      expect(supportTicketsService.createTicket).toHaveBeenCalledWith("access-token", 1);
    });
    expect(await screen.findByText("Open")).toBeInTheDocument();
  });

  it("shows existing ticket status and lets an admin resolve it", async () => {
    vi.spyOn(supportTicketsService, "fetchTicketForFailedOperation").mockResolvedValue({
      id: 7,
      failed_operation_id: 1,
      user_id: 10,
      user_name: "Jane Doe",
      status: "investigating",
      admin_notes: "Looking into it",
      created_by: 1,
      created_by_email: "admin@system.local",
      resolved_by: null,
      resolved_by_email: null,
      created_at: "2026-07-21T18:05:00Z",
      resolved_at: null,
    });
    vi.spyOn(supportTicketsService, "updateTicket").mockResolvedValue({
      id: 7,
      failed_operation_id: 1,
      user_id: 10,
      user_name: "Jane Doe",
      status: "resolved",
      admin_notes: "Looking into it",
      created_by: 1,
      created_by_email: "admin@system.local",
      resolved_by: 1,
      resolved_by_email: "admin@system.local",
      created_at: "2026-07-21T18:05:00Z",
      resolved_at: "2026-07-21T18:10:00Z",
    });

    renderWithRouter(<FailedOperationsPage />);

    await user.click(await screen.findByText("fetch_assignments"));

    expect(await screen.findByText("Investigating")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolved" }));

    await waitFor(() => {
      expect(supportTicketsService.updateTicket).toHaveBeenCalledWith("access-token", 7, {
        status: "resolved",
      });
    });
    expect(await screen.findByText(/Resolved by admin@system.local/)).toBeInTheDocument();
  });
});
