import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("ConnectCanvasPage", () => {
  it("renders the connect canvas step", () => {
    renderWithRouter(<ConnectCanvasPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connect Canvas Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect with Canvas" }),
    ).toBeInTheDocument();
  });

  it("navigates to review permissions after connect", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<ConnectCanvasPage />);

    await user.click(
      screen.getByRole("button", { name: "Connect with Canvas" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith(paths.reviewPermissions);
  });
});
