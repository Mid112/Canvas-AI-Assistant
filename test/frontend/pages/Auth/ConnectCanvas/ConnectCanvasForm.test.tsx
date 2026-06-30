import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { validateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/canvas", () => ({
  validateCanvasToken: vi.fn(),
}));

const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);

const defaultProps = {
  accessToken: "access-token",
  onSubmit: vi.fn(),
  onSkip: vi.fn(),
};

const CANVAS_URL = "https://canvas.university.edu";

async function fillValidConnection(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
  await user.type(screen.getByLabelText(/Canvas API Token/i), "abc123");
  await vi.advanceTimersByTimeAsync(500);
  await screen.findByText("Token is valid");
}

describe("ConnectCanvasForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedValidateCanvasToken.mockResolvedValue("valid");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the token field, add button, and actions", () => {
    renderWithRouter(<ConnectCanvasForm {...defaultProps} />);

    expect(screen.getByLabelText("Canvas URL")).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas API Token/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add another institution" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue without connecting" }),
    ).toBeInTheDocument();
  });

  it("disables connect until a valid URL and token are provided", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ConnectCanvasForm {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeDisabled();

    await fillValidConnection(user);

    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeEnabled();
  });

  it("shows expired status for invalid tokens", async () => {
    const user = userEvent.setup();
    mockedValidateCanvasToken.mockResolvedValue("expired");

    renderWithRouter(<ConnectCanvasForm {...defaultProps} />);

    await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
    await user.type(screen.getByLabelText(/Canvas API Token/i), "expired-token");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByText("Token has expired")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeDisabled();
  });

  it("submits all non-empty trimmed connections", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <ConnectCanvasForm {...defaultProps} onSubmit={onSubmit} />,
    );

    await fillValidConnection(user);

    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );
    const urlFields = screen.getAllByLabelText("Canvas URL");
    const tokenFields = screen.getAllByLabelText(/Canvas API Token/i);
    await user.type(urlFields[1], "https://canvas.other.edu");
    await user.type(tokenFields[1], "token-two");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findAllByText("Token is valid");

    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(onSubmit).toHaveBeenCalledWith({
      connections: [
        { canvasUrl: CANVAS_URL, canvasToken: "abc123" },
        { canvasUrl: "https://canvas.other.edu", canvasToken: "token-two" },
      ],
    });
  });

  it("validates tokens with the canvas URL", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ConnectCanvasForm {...defaultProps} />);

    await fillValidConnection(user);

    expect(mockedValidateCanvasToken).toHaveBeenCalledWith(
      "abc123",
      "access-token",
      CANVAS_URL,
    );
  });

  it("calls onSessionExpired when accessToken is missing during validation", async () => {
    const user = userEvent.setup();
    const onSessionExpired = vi.fn();

    renderWithRouter(
      <ConnectCanvasForm
        {...defaultProps}
        accessToken={null}
        onSessionExpired={onSessionExpired}
      />,
    );

    await user.type(screen.getByLabelText("Canvas URL"), CANVAS_URL);
    await user.type(screen.getByLabelText(/Canvas API Token/i), "token-one");
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
    expect(mockedValidateCanvasToken).not.toHaveBeenCalled();
  });

  it("adds and removes institution token fields", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ConnectCanvasForm {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );

    expect(screen.getAllByLabelText("Canvas URL")).toHaveLength(2);

    await user.click(
      screen.getByRole("button", { name: "Remove institution 2" }),
    );

    expect(screen.getAllByLabelText("Canvas URL")).toHaveLength(1);
  });

  it("calls onSkip when continuing without connecting", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <ConnectCanvasForm {...defaultProps} onSkip={onSkip} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continue without connecting" }),
    );

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when provided", () => {
    renderWithRouter(
      <ConnectCanvasForm
        {...defaultProps}
        error="Unable to connect Canvas. Please check your token and try again."
      />,
    );

    expect(
      screen.getByText("Unable to connect Canvas. Please check your token and try again."),
    ).toBeInTheDocument();
  });
});
