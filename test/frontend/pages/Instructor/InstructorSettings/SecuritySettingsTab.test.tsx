import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecuritySettingsTab } from "@/pages/Instructor/InstructorSettings/SecuritySettingsTab";
import {
  changeCurrentPassword,
  fetchSecurityStatus,
  fetchUserSessions,
  revokeUserSession,
} from "@/services/auth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
  }),
}));

vi.mock("@/services/auth", () => ({
  fetchSecurityStatus: vi.fn(),
  fetchUserSessions: vi.fn(),
  changeCurrentPassword: vi.fn(),
  revokeUserSession: vi.fn(),
}));

const mockedFetchSecurityStatus = vi.mocked(fetchSecurityStatus);
const mockedFetchUserSessions = vi.mocked(fetchUserSessions);
const mockedChangeCurrentPassword = vi.mocked(changeCurrentPassword);
const mockedRevokeUserSession = vi.mocked(revokeUserSession);

const securityStatus = {
  two_factor_enabled: false,
  active_session_count: 2,
};

const sessions = [
  {
    id: 1,
    created_at: "2026-06-26T00:00:00.000Z",
    is_current: true,
  },
  {
    id: 2,
    created_at: "2026-06-27T00:00:00.000Z",
    is_current: false,
  },
];

describe("SecuritySettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchSecurityStatus.mockResolvedValue(securityStatus);
    mockedFetchUserSessions.mockResolvedValue(sessions);
    mockedChangeCurrentPassword.mockResolvedValue(undefined);
    mockedRevokeUserSession.mockResolvedValue(undefined);
  });

  it("loads security status and sessions", async () => {
    renderWithRouter(<SecuritySettingsTab />);

    expect(await screen.findByText("Current Session")).toBeInTheDocument();
    expect(screen.getByText("Signed-in Session")).toBeInTheDocument();
    expect(screen.getByText("2FA Not Enabled")).toBeInTheDocument();
    expect(screen.getByText("2 active sessions")).toBeInTheDocument();
  });

  it("keeps change-password disabled until the new password meets strength rules", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SecuritySettingsTab />);

    await screen.findByText("Current Session");

    const changeButton = screen.getByRole("button", { name: "Change Password" });
    expect(changeButton).toBeDisabled();

    expect(
      screen.getByRole("list", { name: "Password requirements" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Current Password"), "old-password");
    await user.type(screen.getByLabelText("New Password"), "weak");
    expect(changeButton).toBeDisabled();

    await user.clear(screen.getByLabelText("New Password"));
    await user.type(screen.getByLabelText("New Password"), "New-password1!");
    expect(changeButton).toBeEnabled();
  });

  it("changes the password successfully", async () => {
    const user = userEvent.setup();
    renderWithRouter(<SecuritySettingsTab />);

    await screen.findByText("Current Session");
    await user.type(screen.getByLabelText("Current Password"), "old-password");
    await user.type(screen.getByLabelText("New Password"), "New-password1!");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    await waitFor(() => {
      expect(mockedChangeCurrentPassword).toHaveBeenCalledWith("access-token", {
        currentPassword: "old-password",
        newPassword: "New-password1!",
      });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Password updated.");
    expect(screen.getByLabelText("Current Password")).toHaveValue("");
    expect(screen.getByLabelText("New Password")).toHaveValue("");
  });

  it("shows an error when password change fails", async () => {
    const user = userEvent.setup();
    mockedChangeCurrentPassword.mockRejectedValue(
      new Error("Current password is incorrect"),
    );

    renderWithRouter(<SecuritySettingsTab />);

    await screen.findByText("Current Session");
    await user.type(screen.getByLabelText("Current Password"), "wrong");
    await user.type(screen.getByLabelText("New Password"), "New-password1!");
    await user.click(screen.getByRole("button", { name: "Change Password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect",
    );
  });

  it("revokes other sessions and reloads security data", async () => {
    const user = userEvent.setup();
    mockedFetchSecurityStatus
      .mockResolvedValueOnce(securityStatus)
      .mockResolvedValueOnce({
        ...securityStatus,
        active_session_count: 1,
      });
    mockedFetchUserSessions
      .mockResolvedValueOnce(sessions)
      .mockResolvedValueOnce([sessions[0]!]);

    renderWithRouter(<SecuritySettingsTab />);

    await screen.findByText("Signed-in Session");
    await user.click(
      screen.getByRole("button", { name: "Sign Out All Other Sessions" }),
    );

    await waitFor(() => {
      expect(mockedRevokeUserSession).toHaveBeenCalledWith("access-token", 2);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Other sessions signed out.",
    );
  });

  it("shows a load error when security data cannot be fetched", async () => {
    mockedFetchSecurityStatus.mockRejectedValue(new Error("Network error"));

    renderWithRouter(<SecuritySettingsTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Network error");
  });
});
