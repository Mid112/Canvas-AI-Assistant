import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanvasInfoPage } from "@/pages/Auth/CanvasInfoPage";
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

describe("CanvasInfoPage", () => {
  // Verifies: Renders the canvas info overview.
  it("renders the canvas info overview", () => {
    renderWithRouter(<CanvasInfoPage />);

    expect(screen.getByLabelText("Onboarding progress")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Why Canvas Access is Required" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Requested Permissions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Security & Privacy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Proceed to Connect" }),
    ).toBeInTheDocument();
  });

  // Verifies: Shows canvas info as the current onboarding step.
  it("shows canvas info as the current onboarding step", () => {
    renderWithRouter(<CanvasInfoPage />);

    expect(screen.getByText("Canvas Info")).toBeInTheDocument();
    expect(screen.getByText("Connect Canvas Account")).toBeInTheDocument();
    expect(screen.getByText("Review Permissions")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  // Verifies: Renders permission and security details.
  it("renders permission and security details", () => {
    renderWithRouter(<CanvasInfoPage />);

    expect(screen.getByText("View Courses")).toBeInTheDocument();
    expect(screen.getByText("Manage Assignments")).toBeInTheDocument();
    expect(screen.getByText("Enterprise-Grade Encryption")).toBeInTheDocument();
    expect(screen.getByText("Revocable Access")).toBeInTheDocument();
  });

  // Verifies: Navigates to connect canvas when proceed is clicked.
  it("navigates to connect canvas when proceed is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<CanvasInfoPage />);

    await user.click(screen.getByRole("button", { name: "Proceed to Connect" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.connectCanvas);
  });
});
