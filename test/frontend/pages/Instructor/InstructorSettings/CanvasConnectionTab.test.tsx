import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasConnectionTab } from "@/pages/Instructor/InstructorSettings/CanvasConnectionTab";
import {
  removeCanvasConnection,
  updateCanvasConnections,
  updateCanvasToken,
  validateCanvasToken,
} from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockRefreshUser = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "instructor@example.com",
      name: "Dr. Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 10,
          canvas_url: "https://canvas.university.edu",
          created_at: "2026-06-26T00:00:00.000Z",
        },
      ],
    },
    accessToken: "access-token",
    refreshUser: mockRefreshUser,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/services/canvas", () => ({
  CanvasApiError: class CanvasApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  updateCanvasConnections: vi.fn(),
  describeCanvasConnectionFailures: vi.fn(() => ""),
  updateCanvasToken: vi.fn(),
  removeCanvasConnection: vi.fn(),
  validateCanvasToken: vi.fn(),
}));

const mockedUpdateCanvasConnections = vi.mocked(updateCanvasConnections);
const mockedUpdateCanvasToken = vi.mocked(updateCanvasToken);
const mockedRemoveCanvasConnection = vi.mocked(removeCanvasConnection);
const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);

const CANVAS_URL = "https://canvas.university.edu";

async function fillValidNewConnection(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
  await user.type(screen.getByLabelText("Canvas API Token"), "abc123");
  await vi.advanceTimersByTimeAsync(500);
  await screen.findByText("Token is valid");
}

describe("CanvasConnectionTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedValidateCanvasToken.mockResolvedValue("valid");
    mockedUpdateCanvasConnections.mockResolvedValue({
      succeeded: [{ canvasUrl: CANVAS_URL, canvasToken: "abc123" }],
      failed: [],
      lastResponse: {
        id: 1,
        name: "Dr. Jane Doe",
        email: "instructor@example.com",
        role: "instructor",
        is_active: true,
        canvas_connections: [],
        has_canvas_token: true,
      },
    });
    mockedUpdateCanvasToken.mockResolvedValue({
      id: 1,
      name: "Dr. Jane Doe",
      email: "instructor@example.com",
      role: "instructor",
      is_active: true,
      canvas_connections: [],
      has_canvas_token: true,
    });
    mockRefreshUser.mockResolvedValue(undefined);
    mockedRemoveCanvasConnection.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows saved connections and always allows adding more", () => {
    renderWithRouter(<CanvasConnectionTab />);

    expect(screen.getByText("Saved connections")).toBeInTheDocument();
    expect(screen.getByText(CANVAS_URL)).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Add more connections")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add another institution" }),
    ).toBeInTheDocument();
  });

  it("saves multiple new connections with token validation", async () => {
    const user = userEvent.setup();
    renderWithRouter(<CanvasConnectionTab />);

    await fillValidNewConnection(user);

    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );
    const urlFields = screen.getAllByLabelText("Canvas URL");
    const tokenFields = screen.getAllByLabelText("Canvas API Token");
    await user.type(urlFields[1], "https://canvas.other.edu");
    await user.type(tokenFields[1], "token-two");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findAllByText("Token is valid");

    await user.click(screen.getByRole("button", { name: "Save new connections" }));

    await waitFor(() => {
      expect(mockedUpdateCanvasConnections).toHaveBeenCalledWith(
        [
          { canvasUrl: CANVAS_URL, canvasToken: "abc123" },
          { canvasUrl: "https://canvas.other.edu", canvasToken: "token-two" },
        ],
        "access-token",
      );
    });
    expect(mockRefreshUser).toHaveBeenCalled();
  });

  it("edits an existing connection token after validation", async () => {
    const user = userEvent.setup();
    renderWithRouter(<CanvasConnectionTab />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(
      screen.getByLabelText("New Canvas API Token"),
      "replacement-token",
    );
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedUpdateCanvasToken).toHaveBeenCalledWith(
        "replacement-token",
        "access-token",
        CANVAS_URL,
      );
    });
  });

  it("deletes a saved connection", async () => {
    const user = userEvent.setup();
    renderWithRouter(<CanvasConnectionTab />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mockedRemoveCanvasConnection).toHaveBeenCalledWith(10, "access-token");
    });
    expect(mockRefreshUser).toHaveBeenCalled();
  });
});
