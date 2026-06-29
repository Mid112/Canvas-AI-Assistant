import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { DryRunPreviewPage } from "@/pages/Instructor/DryRunPreviewPage";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";
import { paths } from "@/routes/paths";
import {
  confirmDryRunPreview,
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/dryRunPreview", () => ({
  DryRunPreviewError: class DryRunPreviewError extends Error {
    name = "DryRunPreviewError";
  },
  fetchDryRunPreview: vi.fn(),
  confirmDryRunPreview: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDryRunPreview);
const mockedConfirm = vi.mocked(confirmDryRunPreview);

function renderPage(initialEntry = paths.instructor.dryRunPreview) {
  return renderWithRouter(
    <Routes>
      <Route path={paths.instructor.dryRunPreview} element={<DryRunPreviewPage />} />
      <Route path={paths.instructor.assistant} element={<div>Assistant page</div>} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [initialEntry],
      },
    },
  );
}

describe("DryRunPreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue(mockStudentReminderPreview);
    mockedConfirm.mockResolvedValue({
      success: true,
      message: "Workflow approved. Canvas actions will be executed shortly.",
    });
  });

  it("loads and displays the workflow preview", async () => {
    renderPage();

    expect(screen.getByText("Loading workflow preview...")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Workflow Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Original Request")).toBeInTheDocument();
    expect(screen.getByText("Programming Assignment 3: Loops")).toBeInTheDocument();
  });

  it("shows an error state when preview loading fails", async () => {
    mockedFetch.mockRejectedValue(new Error("Unable to load the workflow preview."));

    renderPage(`${paths.instructor.dryRunPreview}?preview=error`);

    expect(
      await screen.findByRole("heading", { name: "Unable to Load Preview" }),
    ).toBeInTheDocument();
  });

  it("returns to the assistant when reject is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Reject/ }));

    expect(await screen.findByText("Assistant page")).toBeInTheDocument();
  });

  it("shows success after approving the workflow", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Approve & Execute/ }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Workflow Approved" })).toBeInTheDocument();
    });
    expect(mockedConfirm).toHaveBeenCalledWith(mockStudentReminderPreview.id);
  });
});
