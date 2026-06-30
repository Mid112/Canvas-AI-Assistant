import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { resetMockInstructors } from "@/services/instructorAccounts";
import { InstructorManagementPage } from "@/pages/Admin/InstructorManagementPage";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("InstructorManagementPage", () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });

  beforeEach(() => {
    resetMockInstructors();
  });

  async function waitForLoaded() {
    await waitFor(() => {
      expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    });
  }

  async function openActionMenu(name: string) {
    await user.click(screen.getByRole("button", { name: `Actions for ${name}` }));
    await waitFor(() => {
      expect(screen.getByText("Edit")).toBeInTheDocument();
    });
  }

  it("renders the instructor management table", async () => {
    renderWithRouter(<InstructorManagementPage />);

    expect(
      screen.getByRole("heading", { name: "User Management" }),
    ).toBeInTheDocument();

    await waitForLoaded();

    expect(screen.getByText("Instructors (4)")).toBeInTheDocument();
    expect(screen.getByText("Dr. Robert Wilson")).toBeInTheDocument();
    expect(screen.getByText("Last Login")).toBeInTheDocument();
    expect(screen.getByText("Showing 4 of 4 instructors")).toBeInTheDocument();
  });

  it("filters instructors by search query", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search users"), "Robert");

    expect(screen.getByText("Dr. Robert Wilson")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Jane Doe")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 4 instructors")).toBeInTheDocument();
  });

  it("opens the create instructor dialog", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "New Instructor" }));

    expect(
      screen.getByRole("heading", { name: "Create instructor account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Temporary Password")).toBeInTheDocument();
  });

  it("opens the edit instructor dialog from the action menu", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await openActionMenu("Dr. Jane Doe");
    await user.click(screen.getByText("Edit"));

    expect(
      screen.getByRole("heading", { name: "Edit instructor account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First Name")).toHaveValue("Dr. Jane");
  });

  it("shows a confirmation dialog before disabling an instructor", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await openActionMenu("Dr. Jane Doe");
    await user.click(screen.getByText("Disable"));

    expect(
      screen.getByRole("heading", { name: "Disable instructor account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Disable Dr. Jane Doe's account\?/i),
    ).toBeInTheDocument();
  });

  it("shows a confirmation dialog before revoking access", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await openActionMenu("Dr. Jane Doe");
    await user.click(screen.getByText("Revoke Access"));

    expect(
      screen.getByRole("heading", { name: "Revoke instructor access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Revoke access for Dr. Jane Doe\?/i),
    ).toBeInTheDocument();
  });

  it("creates an instructor through the full UI flow", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await user.click(screen.getByRole("button", { name: "New Instructor" }));

    await user.type(screen.getByLabelText("First Name"), "Alex");
    await user.type(screen.getByLabelText("Last Name"), "Rivera");
    await user.type(
      screen.getByLabelText("Email Address"),
      "alex@university.edu",
    );
    await user.type(
      screen.getByLabelText("Temporary Password"),
      "temp-password",
    );
    await user.click(screen.getByRole("button", { name: "Create instructor" }));

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Create instructor account" }),
      ).not.toBeInTheDocument();
    });

    expect(
      await screen.findByText("Instructor account created successfully."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Alex Rivera")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
    expect(screen.getByText("Instructors (5)")).toBeInTheDocument();
  });

  it("disables an instructor after confirmation", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await openActionMenu("Dr. Jane Doe");
    await user.click(screen.getByText("Disable"));
    await user.click(screen.getByRole("button", { name: "Disable account" }));

    expect(
      await screen.findByText("Dr. Jane Doe has been disabled."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Disable instructor account")).not.toBeInTheDocument();
    });

    const row = screen.getByText("Dr. Jane Doe").closest("tr");
    expect(row).not.toBeNull();
    expect(row).toHaveTextContent("Disabled");
  });
});
