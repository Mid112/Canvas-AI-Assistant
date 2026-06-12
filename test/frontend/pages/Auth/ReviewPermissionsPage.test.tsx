import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewPermissionsPage } from "@/pages/Auth/ReviewPermissionsPage";
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

describe("ReviewPermissionsPage", () => {
  it("renders the review permissions overview", () => {
    renderWithRouter(<ReviewPermissionsPage />);

    expect(
      screen.getByRole("heading", { name: "Review Permissions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review what the AI assistant can and cannot do in Canvas",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Allowed Actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Restricted Actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & Continue" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders allowed and restricted action details", () => {
    renderWithRouter(<ReviewPermissionsPage />);

    expect(screen.getByText("View courses")).toBeInTheDocument();
    expect(screen.getByText("View assignments")).toBeInTheDocument();
    expect(screen.getByText("View submissions")).toBeInTheDocument();
    expect(screen.getByText("Draft messages")).toBeInTheDocument();
    expect(screen.getByText("Modify grades")).toBeInTheDocument();
    expect(
      screen.getByText("Publish assignments automatically"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/All AI-generated actions will be previewed before execution/),
    ).toBeInTheDocument();
  });

  it("navigates to dashboard when approved", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<ReviewPermissionsPage />);

    await user.click(
      screen.getByRole("button", { name: "Approve & Continue" }),
    );

    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.dashboard);
  });

  it("navigates back to canvas info on cancel", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<ReviewPermissionsPage />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.canvasInfo);
  });
});
