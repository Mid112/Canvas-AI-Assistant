import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { paths } from "@/routes/paths";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { updateCanvasTokens, validateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockLogout = vi.fn();
// Connecting Canvas mutates the backend user record; the page refreshes auth
// state so courses can fetch immediately after onboarding.
const mockRefreshUser = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    },
    accessToken: "access-token",
    logout: mockLogout,
    refreshUser: mockRefreshUser,
  }),
}));

vi.mock("@/lib/onboarding-storage", () => ({
  markOnboardingComplete: vi.fn(),
}));

vi.mock("@/services/canvas", () => ({
  updateCanvasTokens: vi.fn(),
  validateCanvasToken: vi.fn(),
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedUpdateCanvasTokens = vi.mocked(updateCanvasTokens);
const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);
const mockedMarkOnboardingComplete = vi.mocked(markOnboardingComplete);

describe("ConnectCanvasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedValidateCanvasToken.mockResolvedValue("valid");
    mockRefreshUser.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the connect canvas flow", () => {
    renderWithRouter(<ConnectCanvasPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas API Token/i)).toBeInTheDocument();
  });

  it("navigates to review permissions after a successful connection", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasTokens.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      is_active: true,
      has_canvas_token: true,
    });

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText(/Canvas API Token/i), "valid-token");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockedUpdateCanvasTokens).toHaveBeenCalledWith(
      ["valid-token"],
      "access-token",
    );
    // Navigation should wait until AuthContext has reloaded has_canvas_token
    // and canvas_connections from /auth/me.
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
  });

  it("submits multiple tokens when provided", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasTokens.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      is_active: true,
      has_canvas_token: true,
    });

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText(/Canvas API Token/i), "token-one");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );
    await user.type(
      screen.getByLabelText("Canvas API Token (Institution 2)"),
      "token-two",
    );
    await vi.advanceTimersByTimeAsync(500);
    await screen.findAllByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockedUpdateCanvasTokens).toHaveBeenCalledWith(
      ["token-one", "token-two"],
      "access-token",
    );
  });

  it("logs out when the session expires during connect", async () => {
    const user = userEvent.setup();
    const { CanvasApiError } = await import("@/services/canvas");
    mockedUpdateCanvasTokens.mockRejectedValue(
      new CanvasApiError("Invalid token", 401),
    );

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText(/Canvas API Token/i), "valid-token");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("skips canvas connection and opens the query assistant", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConnectCanvasPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue without connecting" }),
    );

    expect(mockedMarkOnboardingComplete).toHaveBeenCalledWith(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
    expect(mockedUpdateCanvasTokens).not.toHaveBeenCalled();
  });
});
