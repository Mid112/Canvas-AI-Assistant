import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockAuditLogs } from "@/data/mockAuditLogs";
import { AuditLogsPage } from "@/pages/Admin/AuditLogsPage";
import * as auditLogsService from "@/services/auditLogs";
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
    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValue(mockAuditLogs);
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByRole("table")).toBeInTheDocument();
    });
  }

  function tableScope() {
    return within(screen.getByRole("table"));
  }

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

  it("filters audit logs by typing in the action combobox", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Filter by action"), "Delete");

    expect(tableScope().queryByText("Create Message Draft")).not.toBeInTheDocument();
    expect(
      screen.getByText("Showing 1 of 1 matching audit logs (5 total)"),
    ).toBeInTheDocument();
  });

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

  it("disables export when no logs match filters", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search logs"), "no matching logs");

    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText("Showing 0 of 5 audit logs")).toBeInTheDocument();
    expect(screen.getByText("No audit logs found.")).toBeInTheDocument();
  });

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

  it("shows action and result badges in each row", async () => {
    renderWithRouter(<AuditLogsPage />);

    await waitForLoaded();

    const row = tableScope().getByText("jane.doe@university.edu").closest("tr");
    expect(row).not.toBeNull();

    const scoped = within(row!);
    expect(scoped.getByText("Create Message Draft")).toBeInTheDocument();
    expect(scoped.getByText("Success")).toBeInTheDocument();
  });

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
      .mockResolvedValueOnce([]);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(retrySpy).toHaveBeenCalled();
    });
  });

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

  it("paginates audit logs", async () => {
    const manyLogs = Array.from({ length: 11 }, (_, index) => ({
      ...mockAuditLogs[0]!,
      id: `audit-page-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      userEmail: `user${index}@university.edu`,
      resource: `Resource ${index}`,
    }));

    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValueOnce(manyLogs);

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

  it("exports all filtered logs across pages", async () => {
    const manyLogs = Array.from({ length: 11 }, (_, index) => ({
      ...mockAuditLogs[0]!,
      id: `audit-export-${index}`,
      timestamp: `2026-05-31T${String(10 + index).padStart(2, "0")}:00:00.000Z`,
      userEmail: `user${index}@university.edu`,
      resource: `Resource ${index}`,
    }));

    vi.spyOn(auditLogsService, "fetchAuditLogs").mockResolvedValueOnce(manyLogs);
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
