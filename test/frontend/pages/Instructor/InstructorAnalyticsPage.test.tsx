import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorAnalyticsPage } from "@/pages/Instructor/InstructorAnalyticsPage";
import { paths } from "@/routes/paths";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const analyticsRoutePath = "/instructor/courses/:courseId/analytics";

function renderAnalyticsPage(
  ui: ReactElement = <InstructorAnalyticsPage />,
  initialEntry = paths.instructor.courseAnalytics(1),
) {
  return renderWithInstitution(
    <Routes>
      <Route path={analyticsRoutePath} element={ui} />
      <Route path={paths.instructor.courses} element={<div>Courses page</div>} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [initialEntry],
      },
    },
  );
}

function UBCOAnalyticsHarness() {
  const { selectedInstitution, setSelectedInstitution } = useInstitution();

  useEffect(() => {
    if (selectedInstitution.id !== "ubco") {
      setSelectedInstitution("ubco");
    }
  }, [selectedInstitution.id, setSelectedInstitution]);

  if (selectedInstitution.id !== "ubco") {
    return null;
  }

  return <InstructorAnalyticsPage />;
}

describe("InstructorAnalyticsPage", () => {
  it("renders course-specific submissions analysis", () => {
    renderAnalyticsPage();

    expect(
      screen.getByRole("heading", { name: "Assignment Submission Analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Courses" })).toHaveAttribute(
      "href",
      paths.instructor.courses,
    );
    expect(screen.getByLabelText("Search or select assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Search students")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Status")).toBeInTheDocument();
    expect(
      screen.queryByText("Analytics coming soon"),
    ).not.toBeInTheDocument();
  });

  it("applies assignment and status filters from the URL", () => {
    renderAnalyticsPage(
      <InstructorAnalyticsPage />,
      `${paths.instructor.courseAnalytics(2)}?assignmentId=hw4&status=missing`,
    );

    expect(screen.getByText("Noah Patel")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Late Submissions" }),
    ).not.toBeInTheDocument();
  });

  it("redirects to courses when the course id is invalid", () => {
    renderAnalyticsPage(
      <InstructorAnalyticsPage />,
      paths.instructor.courseAnalytics(999),
    );

    expect(screen.getByText("Courses page")).toBeInTheDocument();
  });

  it("filters students by search query", async () => {
    const user = userEvent.setup();

    renderAnalyticsPage();

    await user.type(screen.getByLabelText("Search students"), "Maria");

    expect(screen.getByText("Maria Garcia")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
    expect(screen.queryByText("Emma Davis")).not.toBeInTheDocument();
  });

  it("filters assignments by search query", async () => {
    const user = userEvent.setup();

    renderAnalyticsPage(
      <InstructorAnalyticsPage />,
      paths.instructor.courseAnalytics(1),
    );

    const input = screen.getByLabelText("Search or select assignment");
    await user.clear(input);
    await user.type(input, "Programming");

    expect(
      screen.getByRole("option", { name: "Programming Assignment 3" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No assignments match your search."),
    ).not.toBeInTheDocument();
  });

  it("shows empty section states when search has no matches", async () => {
    const user = userEvent.setup();

    renderAnalyticsPage();

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

    renderAnalyticsPage();

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

    renderAnalyticsPage();

    await user.selectOptions(screen.getByLabelText("Filter by Status"), "late");

    expect(
      screen.getByRole("heading", { name: "Late Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Missing Submissions" }),
    ).not.toBeInTheDocument();
  });

  it("loads submission data for the selected institution's course", () => {
    renderAnalyticsPage(
      <UBCOAnalyticsHarness />,
      paths.instructor.courseAnalytics(101),
    );

    expect(
      screen.getByText("COSC 111: Computer Programming I"),
    ).toBeInTheDocument();
    expect(screen.getByText("Jordan Taylor")).toBeInTheDocument();
    expect(screen.queryByText("Alex Thompson")).not.toBeInTheDocument();
  });
});
