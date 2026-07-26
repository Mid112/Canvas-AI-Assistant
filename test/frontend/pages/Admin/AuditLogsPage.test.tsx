import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import { AuditLogsPage } from "@/pages/Admin/AuditLogsPage";
import * as auditLogsService from "@/services/auditLogs";
import type { AuditLogEntry } from "@/types/auditLog";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockUseAuth = vi.fn();

/** fetchAuditLogs now resolves a {entries, total} batch rather than a bare array. */
function toBatch(entries: AuditLogEntry[]): auditLogsService.AuditLogsBatch {
  return { entries, total: entries.length };
}

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

describe("AuditLogsPage", () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });

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
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValue(toBatch(mockAuditLogs));
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  }

  function tableScope() {
    return within(screen.getByRole("table"));
  }

  // Verifies: Renders the audit logs table.
  it("renders the audit logs table", async () => {
    renderWithRouter(<AuditLogsPage />);

    expect(
      screen.getByRole("heading", { name: "Audit Logs" }),
    ).toBeInTheDocument();

    await waitForLoaded();

    expect(tableScope().getByText("alex.j@university.edu")).toBeInTheDocument();
    expect(tableScope().getByText("Delete Assignment")).toBeInTheDocument();
    expect(tableScope().getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–5 of 5 audit logs")).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by user.
  it("filters audit logs by user", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by user"), "admin@system");

    expect(tableScope().getByText("admin@system.local")).toBeInTheDocument();
    expect(tableScope().queryByText("jane.doe@university.edu")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by typing in the action combobox.
  it("filters audit logs by typing in the action combobox", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by action"), "Delete");

    expect(tableScope().queryByText("Create Message Draft")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by selecting an action from the dropdown.
  it("filters audit logs by selecting an action from the dropdown", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter by action"));
    await user.click(screen.getByRole("button", { name: "Export Report" }));

    expect(tableScope().getByText("Missing Work Report - CS 201")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by search query.
  it("filters audit logs by search query", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "Quiz 5");

    expect(tableScope().getByText("Assignment: Quiz 5")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Expands a row to show additional details.
  it("expands a row to show additional details", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(
      screen.getByRole("button", { name: "Expand details for Delete Assignment" }),
    );

    expect(screen.getByText("ASSIGNMENT_LOCKED")).toBeInTheDocument();
    expect(
      screen.getByText("Assignment has active submissions and cannot be deleted."),
    ).toBeInTheDocument();
  });

  // Verifies: Exports filtered audit logs as CSV.
  it("exports filtered audit logs as CSV", async () => {
    const downloadSpy = vi
      .spyOn(auditLogsService, "downloadAuditLogsCsv")
      .mockImplementation(() => {});

    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by user"), "jane.doe");
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toHaveLength(1);
    expect(downloadSpy.mock.calls[0]?.[0][0]?.userEmail).toBe(
      "jane.doe@university.edu",
    );

    downloadSpy.mockRestore();
  });

  // Verifies: Disables export when no logs match filters.
  it("disables export when no logs match filters", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "no matching logs");

    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText("Showing 0 of 5 audit logs")).toBeInTheDocument();
    expect(screen.getByText("No audit logs found.")).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by selecting a user from the dropdown.
  it("filters audit logs by selecting a user from the dropdown", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter by user"));
    await user.click(screen.getByRole("button", { name: "jane.doe@university.edu" }));

    expect(tableScope().getByText("Message Draft #4521")).toBeInTheDocument();
    expect(tableScope().queryByText("admin@system.local")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Resets to default timestamp sort from another column.
  it("resets to default timestamp sort from another column", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter user column"));
    await user.click(await screen.findByText("A to Z"));

    const emailsAfterUserSort = tableScope()
      .getAllByText(/@/)
      .map((element) => element.textContent);
    expect(emailsAfterUserSort[0]).toBe("admin@system.local");

    await user.click(screen.getByLabelText("Filter timestamp column"));
    await user.click(await screen.findByText("Newest first"));

    const emailsAfterDefault = tableScope()
      .getAllByText(/@/)
      .map((element) => element.textContent);
    expect(emailsAfterDefault[0]).toBe("jane.doe@university.edu");
  }, 10000);

  // Verifies: Sorts audit logs by user alphabetically.
  it("sorts audit logs by user alphabetically", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter user column"));
    await user.click(await screen.findByText("A to Z"));

    const emails = tableScope()
      .getAllByText(/@/)
      .map((element) => element.textContent)
      .filter((text) => text?.includes("@"));

    expect(emails[0]).toBe("admin@system.local");
  });

  // Verifies: Filters audit logs by result.
  it("filters audit logs by result", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter result column"));
    await user.click(await screen.findByText("Failed only"));

    expect(tableScope().getByText("Assignment: Quiz 5")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

  // Verifies: Shows action and result badges in each row.
  it("shows action and result badges in each row", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    const row = tableScope().getByText("jane.doe@university.edu").closest("tr");
    expect(row).not.toBeNull();

    const scoped = within(row!);
    expect(scoped.getByText("Create Message Draft")).toBeInTheDocument();
    expect(scoped.getByText("Success")).toBeInTheDocument();
  });

  // Verifies: Shows the page description and audit log count badge.
  it("shows the page description and audit log count badge", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    expect(
      screen.getByText(
        "Review security and compliance events across the platform.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Audit logs (5)")).toBeInTheDocument();
  });

  // Verifies: Offers a "Load more" control when more rows exist on the server than were fetched.
  it("loads the next batch when total exceeds what's already loaded", async () => {
    const fetchSpy = vi
      .spyOn(auditLogsService, "fetchAuditLogs")
      .mockResolvedValueOnce({ entries: mockAuditLogs, total: 7 });

    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();
    expect(screen.getByText("Audit logs (5 of 7)")).toBeInTheDocument();

    const extraLogs = [
      { ...mockAuditLogs[0]!, id: "audit-extra-1", userEmail: "extra1@university.edu" },
      { ...mockAuditLogs[0]!, id: "audit-extra-2", userEmail: "extra2@university.edu" },
    ];
    fetchSpy.mockResolvedValueOnce({ entries: extraLogs, total: 7 });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("Audit logs (7)")).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenLastCalledWith("access-token", {
      offset: 5,
      rangeDays: null,
    });
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: Shows a load error with retry.
  it("shows a load error with retry", async () => {
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockRejectedValueOnce(
      new Error("Network error"),
    );

    renderWithRouter(<AuditLogsPage />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Unable to load audit logs. Please try again.");

    const retrySpy = vi
      .spyOn(auditLogsService, "fetchAuditLogs")
      .mockResolvedValueOnce(toBatch([]));

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalled();
    });
  });

  // Verifies: Filters audit logs by date.
  it("selects a date range and refetches from the server", async () => {
    const fetchSpy = vi.spyOn(auditLogsService, "fetchAuditLogs");
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();
    expect(fetchSpy).toHaveBeenLastCalledWith("access-token", { rangeDays: null });

    const rangedLogs = [mockAuditLogs[0]!];
    fetchSpy.mockResolvedValueOnce(toBatch(rangedLogs));

    await user.selectOptions(
      screen.getByLabelText("Filter by date range"),
      "7",
    );

    // The range is a server-side query param, not a client-side re-filter
    // of what's already loaded — selecting it must trigger a fresh fetch.
    expect(fetchSpy).toHaveBeenLastCalledWith("access-token", { rangeDays: 7 });
    await waitFor(() => {
      expect(screen.getByText("Audit logs (1)")).toBeInTheDocument();
    });
  });

  // Verifies: Clears active filters.
  it("clears active filters", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "Quiz 5");
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 1 matching audit logs (5 total)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByText("Showing 1–5 of 5 audit logs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  // Verifies: Paginates audit logs.
  it("paginates audit logs", async () => {
    const manyLogs = Array.from({ length: 11 }, (_, index) => ({
      ...mockAuditLogs[0]!,
      id: `audit-page-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      userEmail: `user${index}@university.edu`,
      resource: `Resource ${index}`,
    }));

    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValueOnce(toBatch(manyLogs));

    renderWithRouter(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("Audit logs (11)")).toBeInTheDocument();
    });

    expect(screen.getByText("Showing 1–10 of 11 audit logs")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Showing 11 of 11 audit logs")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  // Verifies: Exports all filtered logs across pages.
  it("exports all filtered logs across pages", async () => {
    const manyLogs = Array.from({ length: 11 }, (_, index) => ({
      ...mockAuditLogs[0]!,
      id: `audit-export-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      userEmail: `user${index}@university.edu`,
      resource: `Resource ${index}`,
    }));

    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValueOnce(toBatch(manyLogs));
    const downloadSpy = vi
      .spyOn(auditLogsService, "downloadAuditLogsCsv")
      .mockImplementation(() => {});

    renderWithRouter(<AuditLogsPage />);

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toHaveLength(11);

    downloadSpy.mockRestore();
  });
});
