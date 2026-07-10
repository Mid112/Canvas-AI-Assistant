import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import { InstructorSubmissionsAnalysisHeader } from "@/pages/Instructor/InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const course = institutionCourseData[0]!.courses[0]!;

describe("InstructorSubmissionsAnalysisHeader", () => {
  // Verifies: Renders the page title, course context, and actions.
  it("renders the page title, course context, and actions", () => {
    renderWithRouter(
      <InstructorSubmissionsAnalysisHeader
        course={course}
        onExportReport={() => undefined}
      />,
    );

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
    expect(
      screen.getByRole("button", { name: "Export Report" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Generate Reminder" }),
    ).toHaveAttribute("href", "/instructor/assistant");
  });
});
