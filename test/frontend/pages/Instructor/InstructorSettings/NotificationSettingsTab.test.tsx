// Test note: covers the notification settings tab.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationSettingsTab } from "@/pages/Instructor/InstructorSettings/NotificationSettingsTab";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
} from "@/services/auth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
  }),
}));

vi.mock("@/services/auth", () => ({
  fetchNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn(),
}));

const mockedFetchNotificationSettings = vi.mocked(fetchNotificationSettings);
const mockedUpdateNotificationSettings = vi.mocked(updateNotificationSettings);

describe("NotificationSettingsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchNotificationSettings.mockResolvedValue({
      "new-submissions": true,
    });
    mockedUpdateNotificationSettings.mockResolvedValue({
      "workflow-approvals": true,
      "grade-updates": true,
      "new-submissions": true,
      "urgent-workflows": true,
      "daily-summary": false,
    });
  });

  it("loads remote settings over defaults", async () => {
    renderWithRouter(<NotificationSettingsTab />);

    expect(await screen.findByLabelText("New Submissions")).toBeChecked();
    expect(screen.getByLabelText("Daily Summary")).not.toBeChecked();
    expect(screen.getByText("In-app notifications")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Notifications" }),
    ).toHaveAttribute("href", "/instructor/notifications");
  });

  it("toggles a preference before saving", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationSettingsTab />);

    const checkbox = await screen.findByLabelText("Daily Summary");
    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });

  it("saves notification preferences", async () => {
    const user = userEvent.setup();
    renderWithRouter(<NotificationSettingsTab />);

    await screen.findByLabelText("New Submissions");
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    await waitFor(() => {
      expect(mockedUpdateNotificationSettings).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          "new-submissions": true,
        }),
      );
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Notification preferences saved.",
    );
  });

  it("shows an error when loading preferences fails", async () => {
    mockedFetchNotificationSettings.mockRejectedValue(
      new Error("Unable to load"),
    );

    renderWithRouter(<NotificationSettingsTab />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load");
  });

  it("shows an error when saving preferences fails", async () => {
    const user = userEvent.setup();
    mockedUpdateNotificationSettings.mockRejectedValue(
      new Error("Save failed"),
    );

    renderWithRouter(<NotificationSettingsTab />);

    await screen.findByLabelText("New Submissions");
    await user.click(screen.getByRole("button", { name: "Save Preferences" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Save failed");
  });
});
