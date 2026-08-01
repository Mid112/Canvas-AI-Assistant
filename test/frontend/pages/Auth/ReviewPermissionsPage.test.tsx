import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewPermissionsPage } from "@/pages/Auth/ReviewPermissionsPage";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockUser = {
  id: 1,
  email: "professor@university.edu",
  name: "professor",
  role: "instructor" as const,
  is_active: true,
  has_canvas_token: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/onboarding-storage", () => ({
  markOnboardingComplete: vi.fn(),
}));

import { markOnboardingComplete } from "@/lib/onboarding-storage";

const mockedMarkOnboardingComplete = vi.mocked(markOnboardingComplete);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("ReviewPermissionsPage", () => {
  // Verifies: Renders the review permissions overview.
  it("renders the review permissions overview", () => {
    renderWithRouter(<ReviewPermissionsPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Review Canvas Permissions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Here's what the AI assistant can access in Canvas and why, so you can confirm it before continuing.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Allowed Actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Restricted Actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & Continue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect Canvas" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders allowed and restricted action details.
  it("renders allowed and restricted action details", () => {
    renderWithRouter(<ReviewPermissionsPage />);

    expect(screen.getByText("View courses")).toBeInTheDocument();
    expect(screen.getByText("View assignments")).toBeInTheDocument();
    expect(screen.getByText("View submissions")).toBeInTheDocument();
    expect(screen.getByText("Draft messages")).toBeInTheDocument();
    expect(screen.getByText("Modify grades")).toBeInTheDocument();
    expect(
      screen.getByText("Publish assignments automatically"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All AI-generated actions will be previewed before execution/),
    ).toBeInTheDocument();
  });

  // Verifies: Marks onboarding complete and navigates to role dashboard when approved.
  it("marks onboarding complete and navigates to role dashboard when approved", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    mockedMarkOnboardingComplete.mockClear();

    renderWithRouter(<ReviewPermissionsPage />);

    await user.click(
      screen.getByRole("button", { name: "Approve & Continue" }),
    );

    expect(mockedMarkOnboardingComplete).toHaveBeenCalledWith(mockUser.id);
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.dashboard);
  });

  // Verifies: Navigates back to connect canvas on reconnect.
  it("navigates back to connect canvas on reconnect", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<ReviewPermissionsPage />);

    await user.click(screen.getByRole("button", { name: "Reconnect Canvas" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.connectCanvas);
  });
});
