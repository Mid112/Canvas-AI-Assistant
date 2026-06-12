import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { paths } from "@/routes/paths";
import { getStoredToken } from "@/lib/auth-storage";
import { updateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/lib/auth-storage", () => ({
  getStoredToken: vi.fn(),
}));

vi.mock("@/services/canvas", () => ({
  updateCanvasToken: vi.fn(),
  CanvasApiError: class CanvasApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedUpdateCanvasToken = vi.mocked(updateCanvasToken);

describe("ConnectCanvasPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStoredToken.mockReturnValue("access-token");
  });

  it("renders the connect canvas flow", () => {
    renderWithRouter(<ConnectCanvasPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Enter Your Canvas API Token" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas API Token")).toBeInTheDocument();
  });

  it("navigates to review permissions after a successful connection", async () => {
    const user = userEvent.setup();
    mockedUpdateCanvasToken.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      is_active: true,
      has_canvas_token: true,
    });

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText("Canvas API Token"), "valid-token");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(mockedUpdateCanvasToken).toHaveBeenCalledWith(
      "valid-token",
      "access-token",
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
  });

  it("shows an error when the user is not signed in", async () => {
    const user = userEvent.setup();
    mockedGetStoredToken.mockReturnValue(null);

    renderWithRouter(<ConnectCanvasPage />);

    await user.type(screen.getByLabelText("Canvas API Token"), "valid-token");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You must be signed in to connect Canvas.",
    );
    expect(mockedUpdateCanvasToken).not.toHaveBeenCalled();
  });
});
