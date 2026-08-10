import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResetCanvasTokenDialog } from "@/components/admin/ResetCanvasTokenDialog";
import { resetInstructorCanvasToken } from "@/services/adminCanvasConnections";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ accessToken: "admin-token" }),
}));

vi.mock("@/services/adminCanvasConnections", () => ({
  resetInstructorCanvasToken: vi.fn(),
}));

describe("ResetCanvasTokenDialog", () => {
  beforeEach(() => {
    vi.mocked(resetInstructorCanvasToken).mockReset();
  });

  it("shows the token conflict guidance without a reconnect action", async () => {
    vi.mocked(resetInstructorCanvasToken).mockRejectedValue(
      new Error("This Canvas token is already in use."),
    );
    const user = userEvent.setup();

    renderWithRouter(
      <ResetCanvasTokenDialog
        open
        onOpenChange={vi.fn()}
        instructorId="42"
        instructorName="Instructor"
        canvasUrl="https://canvas.example.edu"
        lockUrl
        onSuccess={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("New Canvas API token"), "shared-token");
    await user.click(screen.getByRole("button", { name: "Update token" }));

    await waitFor(() => {
      expect(screen.getByText("This Canvas token is already in use.")).toBeInTheDocument();
    });
    expect(screen.getByText(/use a different canvas token/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reconnect Canvas" })).not.toBeInTheDocument();
  });
});
