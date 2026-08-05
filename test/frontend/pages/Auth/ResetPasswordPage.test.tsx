import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "@/pages/Auth/ResetPasswordPage";
import { paths } from "@/routes/paths";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "@/services/auth";
import { renderWithRouter } from "../../utils/renderWithRouter";

vi.mock("@/services/auth", async () => {
  const actual = await vi.importActual<typeof import("@/services/auth")>(
    "@/services/auth",
  );
  return {
    ...actual,
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
  };
});

const mockedRequest = vi.mocked(requestPasswordReset);
const mockedConfirm = vi.mocked(confirmPasswordReset);

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRequest.mockResolvedValue({
      message:
        "If an account exists for that email, a password reset was started.",
      reset_token: "reset-token-abc",
    });
    mockedConfirm.mockResolvedValue(undefined);
  });

  it("renders all reset password sections", () => {
    renderWithRouter(<ResetPasswordPage />);

    expect(
      screen.getByRole("heading", { name: "Reset Your Password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter your email address and we'll start a password reset for your account.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Reset Link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Login" }),
    ).toHaveAttribute("href", paths.login);
  });

  it("requests a reset token from the backend and shows the confirm form", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordPage />, {
      routerProps: { initialEntries: [paths.resetPassword] },
    });

    await user.type(
      screen.getByLabelText("Email Address"),
      "you@university.edu",
    );
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    await waitFor(() => {
      expect(mockedRequest).toHaveBeenCalledWith("you@university.edu");
    });
    expect(
      await screen.findByRole("heading", { name: "Choose a New Password" }),
    ).toBeInTheDocument();
  });

  it("confirms a new password when a token is present in the URL", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordPage />, {
      routerProps: {
        initialEntries: [`${paths.resetPassword}?token=from-query`],
      },
    });

    expect(
      screen.getByRole("heading", { name: "Choose a New Password" }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("New Password"), "Newpass123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Newpass123!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => {
      expect(mockedConfirm).toHaveBeenCalledWith("from-query", "Newpass123!");
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your password has been updated",
    );
  });

  it("shows a generic message when no account token is returned", async () => {
    const user = userEvent.setup();
    mockedRequest.mockResolvedValue({
      message:
        "If an account exists for that email, a password reset was started.",
      reset_token: null,
    });

    renderWithRouter(<ResetPasswordPage />, {
      routerProps: { initialEntries: [paths.resetPassword] },
    });

    await user.type(
      screen.getByLabelText("Email Address"),
      "missing@university.edu",
    );
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for that email, a password reset was started.",
    );
    expect(screen.queryByText(/check your inbox/i)).not.toBeInTheDocument();
  });
});
