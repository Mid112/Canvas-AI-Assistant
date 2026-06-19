import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { getStoredToken } from "@/lib/auth-storage";
import { validateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/lib/auth-storage", () => ({
  getStoredToken: vi.fn(),
}));

vi.mock("@/services/canvas", () => ({
  validateCanvasToken: vi.fn(),
}));

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);

describe("ConnectCanvasForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedGetStoredToken.mockReturnValue("access-token");
    mockedValidateCanvasToken.mockResolvedValue("valid");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the token field, add button, and actions", () => {
    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );

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

  it("disables connect until a token is validated", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText(/Canvas API Token/i), "abc123");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByText("Token is valid")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeEnabled();
  });

  it("shows expired status for invalid tokens", async () => {
    const user = userEvent.setup();
    mockedValidateCanvasToken.mockResolvedValue("expired");

    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Canvas API Token/i), "expired-token");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByText("Token has expired")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeDisabled();
  });

  it("submits all non-empty trimmed tokens", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <ConnectCanvasForm onSubmit={onSubmit} onSkip={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Canvas API Token/i), "  token-one  ");
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

    expect(onSubmit).toHaveBeenCalledWith({
      canvasTokens: ["token-one", "token-two"],
    });
  });

  it("does not re-validate unchanged tokens when another field is edited", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Canvas API Token/i), "token-one");
    await vi.advanceTimersByTimeAsync(500);
    await screen.findByText("Token is valid");
    expect(mockedValidateCanvasToken).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );
    await user.type(
      screen.getByLabelText("Canvas API Token (Institution 2)"),
      "token-two",
    );
    await vi.advanceTimersByTimeAsync(500);
    await screen.findAllByText("Token is valid");

    expect(mockedValidateCanvasToken).toHaveBeenCalledTimes(2);
    expect(mockedValidateCanvasToken).toHaveBeenLastCalledWith(
      "token-two",
      "access-token",
    );
  });

  it("adds and removes institution token fields", async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={vi.fn()} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add another institution" }),
    );

    expect(
      screen.getByLabelText("Canvas API Token (Institution 2)"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove institution 2" }),
    );

    expect(
      screen.queryByLabelText("Canvas API Token (Institution 2)"),
    ).not.toBeInTheDocument();
  });

  it("calls onSkip when continuing without connecting", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(
      <ConnectCanvasForm onSubmit={vi.fn()} onSkip={onSkip} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Continue without connecting" }),
    );

    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when provided", () => {
    renderWithRouter(
      <ConnectCanvasForm
        error="Unable to connect Canvas. Please check your token and try again."
        onSubmit={vi.fn()}
        onSkip={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to connect Canvas. Please check your token and try again.",
    );
  });
});
