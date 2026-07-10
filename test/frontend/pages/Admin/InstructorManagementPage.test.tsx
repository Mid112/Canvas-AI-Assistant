import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockInstructors } from "@/data/mockInstructors";
import { InstructorManagementPage } from "@/pages/Admin/InstructorManagementPage";
import * as instructorAccountsService from "@/services/instructorAccounts";
import type { Instructor } from "@/types/instructor";
import { renderWithRouter } from "@test/utils/renderWithRouter";

function makeInstructors(count: number): Instructor[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `instructor-bulk-${index + 1}`,
    firstName: "Dr. Bulk",
    lastName: `Number${index + 1}`,
    email: `bulk${index + 1}@university.edu`,
    status: "active" as const,
    createdAt: "2024-08-12T10:00:00.000Z",
    lastLoginAt: null,
  }));
}

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

describe("InstructorManagementPage", () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      accessToken: "access-token",
      user: { email: "admin@system.local", role: "admin" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.spyOn(instructorAccountsService, "fetchInstructors").mockResolvedValue(
      mockInstructors,
    );
    vi.spyOn(instructorAccountsService, "createInstructor").mockImplementation(
      async (_token, payload) => ({
        id: "instructor-new",
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        status: "active",
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      }),
    );
    vi.spyOn(instructorAccountsService, "disableInstructor").mockImplementation(
      async (_token, id) => {
        const instructor = mockInstructors.find((item) => item.id === id)!;
        return { ...instructor, status: "disabled" };
      },
    );
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

  // Verifies: Renders the instructor management table.
  it("renders the instructor management table", async () => {
    renderWithRouter(<InstructorManagementPage />);

    expect(
      screen.getByRole("heading", { name: "User Management" }),
    ).toBeInTheDocument();

    await waitForLoaded();

    expect(screen.getByText("Instructors (4)")).toBeInTheDocument();
    expect(screen.getByText("Dr. Robert Wilson")).toBeInTheDocument();
    expect(screen.getByText("Last Login")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–4 of 4")).toBeInTheDocument();
  });

  it("filters instructors by search query", async () => {
    renderWithRouter(<InstructorManagementPage />);

    await waitForLoaded();

    await user.type(screen.getByLabelText("Search users"), "Robert");

    expect(screen.getByText("Dr. Robert Wilson")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Jane Doe")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
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

  // Verifies: Opens the edit instructor dialog from the action menu.
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

  // Verifies: Shows a confirmation dialog before disabling an instructor.
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

  // Verifies: Shows a confirmation dialog before revoking access.
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

  // Verifies: Creates an instructor through the full UI flow.
  it("creates an instructor through the full UI flow", async () => {
    vi.spyOn(instructorAccountsService, "fetchInstructors")
      .mockResolvedValueOnce(mockInstructors)
      .mockResolvedValue([
        ...mockInstructors,
        {
          id: "instructor-new",
          firstName: "Alex",
          lastName: "Rivera",
          email: "alex@university.edu",
          status: "active" as const,
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
        },
      ]);

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

    const credentialsDialog = screen.getByRole("dialog", {
      name: "Instructor account created",
    });
    expect(within(credentialsDialog).getByText("alex@university.edu")).toBeInTheDocument();
    expect(within(credentialsDialog).getByText("temp-password")).toBeInTheDocument();

    await user.click(within(credentialsDialog).getByRole("button", { name: "Done" }));

    expect(
      screen.queryByRole("heading", { name: "Instructor account created" }),
    ).not.toBeInTheDocument();
  });

  it("disables an instructor after confirmation", async () => {
    vi.spyOn(instructorAccountsService, "fetchInstructors")
      .mockResolvedValueOnce(mockInstructors)
      .mockResolvedValue(
        mockInstructors.map((instructor) =>
          instructor.firstName === "Dr. Jane"
            ? { ...instructor, status: "disabled" as const }
            : instructor,
        ),
      );

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

  it("paginates large instructor lists instead of rendering every row", async () => {
    const bulkInstructors = makeInstructors(30);
    vi.spyOn(instructorAccountsService, "fetchInstructors").mockResolvedValue(
      bulkInstructors,
    );

    renderWithRouter(<InstructorManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructors (30)")).toBeInTheDocument();
    });

    // Default page size is 10, so 30 instructors span 3 pages.
    expect(screen.getAllByRole("row")).toHaveLength(11); // header + 10 per page
    expect(screen.getByText("Showing 1–10 of 30")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Dr. Bulk Number1")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Bulk Number11")).not.toBeInTheDocument();

    const previousButton = screen.getByRole("button", { name: "Previous page" });
    const nextButton = screen.getByRole("button", { name: "Next page" });
    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    await user.click(nextButton);

    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Dr. Bulk Number11")).toBeInTheDocument();
    expect(screen.queryByText("Dr. Bulk Number1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).not.toBeDisabled();
  });

  it("resets to page 1 when the search query changes", async () => {
    const bulkInstructors = makeInstructors(30);
    vi.spyOn(instructorAccountsService, "fetchInstructors").mockResolvedValue(
      bulkInstructors,
    );

    renderWithRouter(<InstructorManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructors (30)")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    // "bulk" still matches all 30 instructors (same 3 pages), but changing the
    // search query should snap the view back to page 1 rather than leaving it
    // stranded on a page that may no longer exist for the new result set.
    await user.type(screen.getByLabelText("Search users"), "bulk");

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    });
  });

  it("changes the page size and resets to page 1", async () => {
    const bulkInstructors = makeInstructors(30);
    vi.spyOn(instructorAccountsService, "fetchInstructors").mockResolvedValue(
      bulkInstructors,
    );

    renderWithRouter(<InstructorManagementPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructors (30)")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Rows per page"), "25");

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("Showing 1–25 of 30")).toBeInTheDocument();
  });
});
