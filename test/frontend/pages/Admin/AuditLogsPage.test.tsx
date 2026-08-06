// Test note: covers the audit logs page.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import { sortAuditLogs } from "@/lib/audit-log-query";
import { AuditLogsPage } from "@/pages/Admin/AuditLogsPage";
import * as auditLogsService from "@/services/auditLogs";
import type { AuditLogEntry } from "@/types/auditLog";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockUseAuth = vi.fn();

/** fetchAuditLogs now resolves a {entries, total} batch rather than a bare array. */
function toBatch(entries: AuditLogEntry[]): auditLogsService.AuditLogsBatch {
  return { entries, total: entries.length };
}

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

/** Stands in for the real backend's search/filter/sort logic
 * (services/audit.py) so tests can drive the same filter bar and column-sort
 * interactions as before -- just now routed through the (mocked) server call
 * instead of client-side filtering/sorting, matching the true-global-sort
 * contract the real backend now provides. */
function fakeServerFetch(all: AuditLogEntry[]) {
  return async (
    _accessToken: string,
    params: auditLogsService.FetchAuditLogsParams = {},
  ): Promise<auditLogsService.AuditLogsBatch> => {
    const {
      search,
      action,
      user,
      result,
      startTime,
      endTime,
      offset = 0,
      limit = all.length,
      sortField,
      sortDirection,
    } = params;

    let filtered = all;
    if (action) {
      filtered = filtered.filter((log) => matchesQuery(log.action, action));
    }
    if (user) {
      filtered = filtered.filter((log) =>
        matchesQuery(`${log.userEmail} ${log.userRole}`, user),
      );
    }
    if (result) {
      filtered = filtered.filter((log) => log.result === result);
    }
    if (startTime) {
      filtered = filtered.filter((log) => log.timestamp >= startTime);
    }
    if (endTime) {
      filtered = filtered.filter((log) => log.timestamp < endTime);
    }
    if (search) {
      filtered = filtered.filter((log) =>
        matchesQuery(
          [log.userEmail, log.userRole, log.action, log.resource, log.result].join(" "),
          search,
        ),
      );
    }
    if (sortField) {
      filtered = sortAuditLogs(filtered, {
        field: sortField,
        direction: sortDirection ?? "desc",
      });
    }

    return { entries: filtered.slice(offset, offset + limit), total: filtered.length };
  };
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
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockImplementation(
      fakeServerFetch(mockAuditLogs),
    );
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

  // Verifies: Filters audit logs by user (server-side, debounced).
  it("filters audit logs by user", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by user"), "admin@system");

    // "admin@system.local" is present both before and after filtering (it's
    // one of the 5 seed rows), so wait on a count that can only be true
    // once the debounced server fetch has actually narrowed the results.
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("admin@system.local")).toBeInTheDocument();
    expect(tableScope().queryByText("jane.doe@university.edu")).not.toBeInTheDocument();
  });

  // Verifies: Filters audit logs by typing in the action combobox.
  it("filters audit logs by typing in the action combobox", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by action"), "Delete");

    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().queryByText("Create Message Draft")).not.toBeInTheDocument();
  });

  // Verifies: Filters audit logs by selecting an action from the dropdown.
  it("filters audit logs by selecting an action from the dropdown", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter by action"));
    await user.click(screen.getByRole("button", { name: "Export Report" }));

    // "Missing Work Report - CS 201" is also present before filtering (one
    // of the 5 seed rows), so wait on the narrowed count instead.
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("Missing Work Report - CS 201")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
  });

  // Verifies: Filters audit logs by search query.
  it("filters audit logs by search query", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "Quiz 5");

    // "Assignment: Quiz 5" is also present before filtering (one of the 5
    // seed rows), so wait on the narrowed count instead.
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("Assignment: Quiz 5")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
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
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(downloadSpy).toHaveBeenCalledTimes(1);
    expect(downloadSpy.mock.calls[0]?.[0]).toHaveLength(1);
    expect(downloadSpy.mock.calls[0]?.[0][0]?.userEmail).toBe(
      "jane.doe@university.edu",
    );

    downloadSpy.mockRestore();
  });

  // Verifies: Export fetches whatever hasn't been loaded yet (server-side
  // "hasMore") before downloading, rather than silently truncating to
  // whatever's already in `logs`.
  it("fetches remaining server-side rows before exporting when hasMore is true", async () => {
    const extraLogs = [
      { ...mockAuditLogs[0]!, id: "audit-extra-1", userEmail: "extra1@university.edu" },
      { ...mockAuditLogs[0]!, id: "audit-extra-2", userEmail: "extra2@university.edu" },
    ];
    const fetchSpy = vi
      .spyOn(auditLogsService, "fetchAuditLogs")
      .mockImplementation(async (_token, params: auditLogsService.FetchAuditLogsParams = {}) => {
        if (params.offset === 5) {
          return { entries: extraLogs, total: 7 };
        }
        return { entries: mockAuditLogs, total: 7 };
      });
    const downloadSpy = vi
      .spyOn(auditLogsService, "downloadAuditLogsCsv")
      .mockImplementation(() => {});

    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();
    expect(screen.getByText("Audit logs (5 of 7)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledTimes(1);
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "access-token",
      expect.objectContaining({ offset: 5 }),
    );
    expect(downloadSpy.mock.calls[0]?.[0]).toHaveLength(7);
    expect(screen.getByText("Audit logs (7)")).toBeInTheDocument();

    downloadSpy.mockRestore();
  });

  // Verifies: Disables export when no logs match filters.
  it("disables export when no logs match filters", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "no matching logs");

    await waitFor(() => {
      expect(screen.getByText("No audit logs found.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    // Server-side filtering means there's no separate "loaded but
    // unfiltered" count anymore -- both matching and total collapse to 0.
    expect(screen.getByText("Showing 0 of 0 audit logs")).toBeInTheDocument();
  });

  // Verifies: Filters audit logs by selecting a user from the dropdown.
  it("filters audit logs by selecting a user from the dropdown", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter by user"));
    await user.click(screen.getByRole("button", { name: "jane.doe@university.edu" }));

    // "Message Draft #4521" is also present before filtering (one of the 5
    // seed rows), so wait on the narrowed count instead.
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("Message Draft #4521")).toBeInTheDocument();
    expect(tableScope().queryByText("admin@system.local")).not.toBeInTheDocument();
  });

  // Verifies: Resets to default timestamp sort from another column.
  it("resets to default timestamp sort from another column", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter user column"));
    await user.click(await screen.findByText("A to Z"));

    // Sort is now a server round-trip (debounced), not an instant client-side
    // re-sort -- wait for the re-fetched, re-sorted rows to land.
    await waitFor(() => {
      const emailsAfterUserSort = tableScope()
        .getAllByText(/@/)
        .map((element) => element.textContent);
      expect(emailsAfterUserSort[0]).toBe("admin@system.local");
    });

    await user.click(screen.getByLabelText("Filter timestamp column"));
    await user.click(await screen.findByText("Newest first"));

    await waitFor(() => {
      const emailsAfterDefault = tableScope()
        .getAllByText(/@/)
        .map((element) => element.textContent);
      expect(emailsAfterDefault[0]).toBe("jane.doe@university.edu");
    });
  }, 10000);

  // Verifies: Sorts audit logs by user alphabetically.
  it("sorts audit logs by user alphabetically", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter user column"));
    await user.click(await screen.findByText("A to Z"));

    // Sort is now a server round-trip (debounced), not an instant client-side
    // re-sort -- wait for the re-fetched, re-sorted rows to land.
    await waitFor(() => {
      const emails = tableScope()
        .getAllByText(/@/)
        .map((element) => element.textContent)
        .filter((text) => text?.includes("@"));
      expect(emails[0]).toBe("admin@system.local");
    });
  });

  // Verifies: Filters audit logs by result.
  it("filters audit logs by result", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.click(screen.getByLabelText("Filter result column"));
    await user.click(await screen.findByText("Failed only"));

    // "Assignment: Quiz 5" is also present before filtering (one of the 5
    // seed rows), so wait on the narrowed count instead.
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("Assignment: Quiz 5")).toBeInTheDocument();
    expect(tableScope().queryByText("Message Draft #4521")).not.toBeInTheDocument();
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
    const extraLogs = [
      { ...mockAuditLogs[0]!, id: "audit-extra-1", userEmail: "extra1@university.edu" },
      { ...mockAuditLogs[0]!, id: "audit-extra-2", userEmail: "extra2@university.edu" },
    ];
    // Keyed by offset (not call order) -- the page also fires an
    // unfiltered "options sample" fetch on mount, so relying on
    // mockResolvedValueOnce's call-order queue would be a race.
    const fetchSpy = vi
      .spyOn(auditLogsService, "fetchAuditLogs")
      .mockImplementation(async (_token, params: auditLogsService.FetchAuditLogsParams = {}) => {
        if (params.offset === 5) {
          return { entries: extraLogs, total: 7 };
        }
        return { entries: mockAuditLogs, total: 7 };
      });

    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();
    expect(screen.getByText("Audit logs (5 of 7)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("Audit logs (7)")).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenLastCalledWith("access-token", {
      offset: 5,
      sortField: "timestamp",
      sortDirection: "desc",
    });
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: Shows a load error with retry.
  it("shows a load error with retry", async () => {
    // mockRejectedValue (not "Once") so both the options-sample fetch and
    // the main load fail regardless of which one the runtime happens to
    // resolve first.
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockRejectedValue(
      new Error("Network error"),
    );

    renderWithRouter(<AuditLogsPage />);

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Unable to load audit logs. Please try again.");

    const retrySpy = vi
      .spyOn(auditLogsService, "fetchAuditLogs")
      .mockResolvedValue(toBatch([]));

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalled();
    });
  });

  // Verifies: Filters audit logs by date.
  it("filters audit logs by date", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by date"), "2026-05-31");

    await waitFor(() => {
      expect(screen.getByText("Showing 1–5 of 5 audit logs")).toBeInTheDocument();
    });
    expect(tableScope().getByText("jane.doe@university.edu")).toBeInTheDocument();
  });

  // Verifies: Clears active filters.
  it("clears active filters", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "Quiz 5");
    await waitFor(() => {
      expect(screen.getByText("Showing 1 of 1 audit logs")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => {
      expect(screen.getByText("Showing 1–5 of 5 audit logs")).toBeInTheDocument();
    });
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

    // mockResolvedValue (not "Once") -- the page also fires an unfiltered
    // "options sample" fetch on mount, so a call-order queue would race.
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValue(toBatch(manyLogs));

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

    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValue(toBatch(manyLogs));
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
