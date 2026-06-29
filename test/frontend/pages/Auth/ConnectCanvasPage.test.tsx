import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { paths } from "@/routes/paths";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { updateCanvasConnections, validateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockRefreshUser = vi.fn().mockResolvedValue(undefined);

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockLogout = vi.fn();

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
    expect(screen.getByLabelText("Canvas URL")).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas API Token/i)).toBeInTheDocument();
  });

  it("navigates to review permissions after a successful connection", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasConnections.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [],
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
    expect(mockRefreshUser).toHaveBeenCalled();
    expect(mockedMarkOnboardingComplete).toHaveBeenCalledWith(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
  });

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
