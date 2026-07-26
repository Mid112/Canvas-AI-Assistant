import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { paths } from "@/routes/paths";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { updateCanvasConnections, validateCanvasToken } from "@/services/canvas";
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
  updateCanvasConnections: vi.fn(),
  describeCanvasConnectionFailures: vi.fn(() => ""),
  validateCanvasToken: vi.fn(),
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedUpdateCanvasConnections = vi.mocked(updateCanvasConnections);
const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);
const mockedMarkOnboardingComplete = vi.mocked(markOnboardingComplete);

const CANVAS_URL = "https://canvas.university.edu";

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

  // Verifies: Renders the connect canvas flow.
  it("renders the connect canvas flow", () => {
    renderWithRouter(<ConnectCanvasPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas URL")).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas API Token/i)).toBeInTheDocument();
  });

  // Verifies: Navigates to review permissions after a successful connection.
  it("navigates to review permissions after a successful connection", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasConnections.mockResolvedValue({
      succeeded: [{ canvasUrl: CANVAS_URL, canvasToken: "valid-token" }],
      failed: [],
      lastResponse: {
        id: 1,
        email: "professor@university.edu",
        is_active: true,
        has_canvas_token: true,
      },
    });

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
    await user.type(screen.getByLabelText(/Canvas API Token/i), "valid-token");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockedUpdateCanvasConnections).toHaveBeenCalledWith(
      [{ canvasUrl: CANVAS_URL, canvasToken: "valid-token" }],
      "access-token",
    );
    // Users move to the next step once the save succeeds; AuthContext still
    // refreshes afterward so later Canvas-backed pages get fresh connection data.
    expect(mockedMarkOnboardingComplete).toHaveBeenCalledWith(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
  });

  // Verifies: Still navigates when the post-connect auth refresh fails.
  it("still navigates when the post-connect auth refresh fails", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasConnections.mockResolvedValue({
      succeeded: [{ canvasUrl: CANVAS_URL, canvasToken: "valid-token" }],
      failed: [],
      lastResponse: {
        id: 1,
        email: "professor@university.edu",
        is_active: true,
        has_canvas_token: true,
      },
    });
    // Token save is the critical path; a later /auth/me refresh failure should
    // not surface as a failed Canvas connection after navigation has started.
    mockRefreshUser.mockRejectedValue(new Error("Refresh failed"));

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
    await user.type(screen.getByLabelText(/Canvas API Token/i), "valid-token");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
    expect(
      screen.queryByText(
        "Unable to connect Canvas. Please check your token and try again.",
      ),
    ).not.toBeInTheDocument();
  });

  // Verifies: Logs out when the session expires during connect.
  it("logs out when the session expires during connect", async () => {
    const user = userEvent.setup();
    const { CanvasApiError } = await import("@/services/canvas");
    mockedUpdateCanvasConnections.mockRejectedValue(
      new CanvasApiError("Invalid token", 401),
    );

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
    await user.type(screen.getByLabelText(/Canvas API Token/i), "valid-token");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Verifies: Skips canvas connection and opens the assistant in limited mode.
  it("skips canvas connection and opens the query assistant", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ConnectCanvasPage />);

    await user.click(
      screen.getByRole("button", { name: "Continue without connecting" }),
    );

    expect(mockedMarkOnboardingComplete).toHaveBeenCalledWith(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
    expect(mockedUpdateCanvasConnections).not.toHaveBeenCalled();
  });
});
