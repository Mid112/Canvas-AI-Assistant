import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubmissionStudentCell } from "@/pages/Instructor/InstructorSubmissionsAnalysis/SubmissionStudentCell";

describe("SubmissionStudentCell", () => {
  // Verifies: Renders student initials and name.
  it("renders student initials and name", () => {
    render(
      <SubmissionStudentCell
        student={{
          id: "student-1",
          name: "Alex Thompson",
          email: "alex.thompson@student.ubc.ca",
          avatarColor: "bg-sky-500",
        }}
      />,
    );

    expect(screen.getByText("Alex Thompson")).toBeInTheDocument();
    expect(screen.getByText("AT")).toBeInTheDocument();
  });
});
