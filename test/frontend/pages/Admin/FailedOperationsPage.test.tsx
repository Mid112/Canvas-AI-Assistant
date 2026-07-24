import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FailedOperationsPage } from "@/pages/Admin/FailedOperationsPage";
import * as failedOperationsService from "@/services/failedOperations";
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
    error_detail: "Canvas 401 Unauthorized",
    context_json: { canvas_connection_id: 3 },
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
    error_detail: "LLM request timed out after 60s",
    context_json: {},
    created_at: "2026-07-21T17:00:00Z",
  },
];

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
      async (_token, id) => items.find((item) => item.id === id)!,
    );
  });

  it("renders summary cards and the failure list", async () => {
    renderWithRouter(<FailedOperationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed Operations")).toBeInTheDocument();
    });

    expect(screen.getByText("Total failures")).toBeInTheDocument();
    expect(screen.getByText("Canvas failures")).toBeInTheDocument();
    expect(screen.getByText("AI failures")).toBeInTheDocument();
    expect(screen.getAllByText("Canvas 401 Unauthorized").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LLM request timed out after 60s").length).toBeGreaterThan(0);
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
  });
});
