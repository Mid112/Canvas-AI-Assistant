import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSettingsPage } from "@/pages/Admin/AdminSettingsPage";
import * as adminSettingsService from "@/services/adminSettings";
import * as adminUsersService from "@/services/adminUsers";
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

describe("AdminSettingsPage", () => {
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
    vi.spyOn(adminSettingsService, "fetchAdminSettings").mockResolvedValue({
      organization_name: "UBC",
      allow_instructor_self_registration: true,
      session_timeout_minutes: 30,
    });
    vi.spyOn(adminUsersService, "createAdmin").mockResolvedValue({
      id: 42,
      name: "Backup Admin",
      email: "backup-admin@example.com",
      role: "admin",
      is_active: true,
      created_at: new Date().toISOString(),
    });
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByDisplayValue("UBC")).toBeInTheDocument();
    });
  }

  it("creates another admin account and shows a confirmation", async () => {
    renderWithRouter(<AdminSettingsPage />);
    await waitForLoaded();

    const createButton = screen.getByRole("button", { name: "Create admin account" });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Backup Admin");
    await user.type(screen.getByLabelText("Email"), "backup-admin@example.com");
    await user.type(screen.getByLabelText("Temporary password"), "supersecret1");

    expect(createButton).toBeEnabled();
    await user.click(createButton);

    await waitFor(() => {
      expect(adminUsersService.createAdmin).toHaveBeenCalledWith("access-token", {
        name: "Backup Admin",
        email: "backup-admin@example.com",
        password: "supersecret1",
      });
    });

    expect(
      await screen.findByText("backup-admin@example.com can now sign in as an administrator."),
    ).toBeInTheDocument();
  });

  it("shows an error message when admin creation fails", async () => {
    vi.spyOn(adminUsersService, "createAdmin").mockRejectedValueOnce(
      new Error("Email already registered"),
    );

    renderWithRouter(<AdminSettingsPage />);
    await waitForLoaded();

    await user.type(screen.getByLabelText("Name"), "Backup Admin");
    await user.type(screen.getByLabelText("Email"), "backup-admin@example.com");
    await user.type(screen.getByLabelText("Temporary password"), "supersecret1");
    await user.click(screen.getByRole("button", { name: "Create admin account" }));

    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
  });
});
