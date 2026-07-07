import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { InstructorCourseHeader } from "@/pages/Instructor/InstructorCourse/InstructorCourseHeader";
import { InstructorCourseTabs } from "@/pages/Instructor/InstructorCourse/InstructorCourseTabs";
import { InstructorCourseOverviewMetrics } from "@/pages/Instructor/InstructorCourse/InstructorCourseOverviewMetrics";
import { RecentAssignmentsCard } from "@/pages/Instructor/InstructorCourse/RecentAssignmentsCard";
import { instructorCoursePath } from "@/routes/paths";
import type { CourseOverviewData } from "@/types/courseOverview";

const course = institutionCourseData[0]!.courses[0]!;

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => ({
    activeCourse: {
      localId: course.id,
      displayName: formatInstructorCourseTitle(course),
    },
    isSaving: false,
    selectActiveCourse: vi.fn(),
  }),
}));

const overview: CourseOverviewData = {
  localId: course.id,
  canvasCourseId: "123",
  name: course.name,
  term: "Fall 2026",
  isActive: true,
  studentCount: 45,
  assignmentCount: 8,
  missingSubmissions: 2,
  lateSubmissions: 1,
  averageGrade: 82,
  completionRate: 91,
  recentAssignments: [
    {
      localId: 1,
      title: "Variables and Data Types Quiz",
      dueDate: "2026-10-15T00:00:00Z",
      submittedCount: 38,
      totalStudents: 45,
      status: "active",
    },
  ],
  recentActivity: [
    {
      studentName: "Sarah Johnson",
      action: "Submitted Assignment 3",
      occurredAt: "2026-10-10T12:00:00Z",
    },
  ],
};

describe("InstructorCourseHeader", () => {
  it("renders course title and active status", () => {
    render(
      <MemoryRouter>
        <InstructorCourseHeader localCourseId={course.id} course={course} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        name: formatInstructorCourseTitle(course),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/45 Students · 8 Assignments/)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Courses/i })).toHaveAttribute(
      "href",
      "/instructor/courses",
    );
  });
});

describe("InstructorCourseTabs", () => {
  it("renders course section tabs", () => {
    render(
      <MemoryRouter initialEntries={[instructorCoursePath(course.id)]}>
        <InstructorCourseTabs localCourseId={course.id} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      instructorCoursePath(course.id),
    );
    expect(screen.getByRole("link", { name: "Assignments" })).toHaveAttribute(
      "href",
      `/instructor/courses/${course.id}/assignments`,
    );
    expect(screen.getByRole("link", { name: "Students" })).toHaveAttribute(
      "href",
      `/instructor/courses/${course.id}/students`,
    );
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute(
      "href",
      `/instructor/courses/${course.id}/analytics`,
    );
  });
});

describe("InstructorCourseOverviewMetrics", () => {
  it("renders overview metric cards", () => {
    render(
      <InstructorCourseOverviewMetrics course={course} overview={overview} />,
    );

    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("Average Grade")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });
});

describe("RecentAssignmentsCard", () => {
  it("renders recent assignments with status", () => {
    render(
      <MemoryRouter>
        <RecentAssignmentsCard
          localCourseId={course.id}
          assignments={overview.recentAssignments}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Variables and Data Types Quiz")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View All" })).toHaveAttribute(
      "href",
      `/instructor/courses/${course.id}/assignments`,
    );
  });
});
