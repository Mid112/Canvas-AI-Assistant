import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import { InstructorSubmissionsAnalysisHeader } from "@/pages/Instructor/InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const course = institutionCourseData[0]!.courses[0]!;

describe("InstructorSubmissionsAnalysisHeader", () => {
  // Verifies: Renders the embedded header variant without the back link.
  it("renders the embedded header variant without the back link", () => {
    renderWithRouter(
      <InstructorSubmissionsAnalysisHeader
        course={course}
        embedded
        onExportReport={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Assignment Submission Analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Back to Courses" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
  });
});
