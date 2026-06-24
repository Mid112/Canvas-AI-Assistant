import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorAnalyticsPage } from "@/pages/Instructor/InstructorAnalyticsPage";
import { paths } from "@/routes/paths";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

function InstitutionSwitchHarness() {
  const { setSelectedInstitution } = useInstitution();

  return (
    <>
      <button type="button" onClick={() => setSelectedInstitution("ubco")}>
        Switch to UBCO
      </button>
      <InstructorAnalyticsPage />
    </>
  );
}

describe("InstructorAnalyticsPage", () => {
  it("renders the submissions analysis page instead of the placeholder", () => {
    renderWithInstitution(<InstructorAnalyticsPage />);

    expect(
      screen.getByRole("heading", { name: "Missing Submissions Analysis" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/incomplete assignments at UBC\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Select Assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Search students")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Status")).toBeInTheDocument();
    expect(
      screen.queryByText("Analytics coming soon"),
    ).not.toBeInTheDocument();
  });

  it("applies assignment and status filters from the URL", () => {
    renderWithInstitution(<InstructorAnalyticsPage />, {
      routerProps: {
        initialEntries: [
          `${paths.instructor.analytics}?assignmentId=hw4&status=missing`,
        ],
      },
    });

    expect(screen.getByText("Noah Patel")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Late Submissions" }),
    ).not.toBeInTheDocument();
  });

  it("filters students by search query", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorAnalyticsPage />);

    await user.type(screen.getByLabelText("Search students"), "Maria");

    expect(screen.getByText("Maria Garcia")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
    expect(screen.queryByText("Emma Davis")).not.toBeInTheDocument();
  });

  it("shows empty section states when search has no matches", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorAnalyticsPage />);

    await user.type(screen.getByLabelText("Search students"), "zzzz");

    expect(
      screen.getByText("No missing submissions match your filters."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No late submissions match your filters."),
    ).toBeInTheDocument();
  });

  it("shows only missing submissions when filtered by status", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorAnalyticsPage />);

    await user.selectOptions(
      screen.getByLabelText("Filter by Status"),
      "missing",
    );

    expect(
      screen.getByRole("heading", { name: "Missing Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Late Submissions" }),
    ).not.toBeInTheDocument();
  });

  it("shows only late submissions when filtered by status", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstructorAnalyticsPage />);

    await user.selectOptions(screen.getByLabelText("Filter by Status"), "late");

    expect(
      screen.getByRole("heading", { name: "Late Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Missing Submissions" }),
    ).not.toBeInTheDocument();
  });

  it("updates data when assignment or institution changes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstitutionSwitchHarness />);

    await user.selectOptions(
      screen.getByLabelText("Select Assignment"),
      "hw4",
    );

    expect(screen.getByText("Noah Patel")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to UBCO" }));

    expect(screen.getByText("Jordan Taylor")).toBeInTheDocument();
    expect(screen.queryByText("Noah Patel")).not.toBeInTheDocument();
  });
});
