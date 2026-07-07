import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Outlet, Route, Routes } from "react-router-dom";

import { institutionCourseData } from "@/data/institutionCourseData";
import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";
import { InstructorCourseStudentsPage } from "@/pages/Instructor/InstructorCourseStudentsPage";
import { fetchCourseStudentsWithSubmissionFallback } from "@/services/students";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const course = {
  ...institutionCourseData[0]!.courses[0]!,
  canvasCourseId: 42,
  canvasUrl: "https://canvas.example.edu",
};

vi.mock("@/services/students", () => ({
  StudentApiError: class StudentApiError extends Error {
    name = "StudentApiError";
    status = 500;
  },
  fetchCourseStudentsWithSubmissionFallback: vi.fn(),
}));

vi.mock("@/hooks/useResolvedInstructorCourse", () => ({
  useResolvedInstructorCourse: () => ({
    course: null,
    canvasUrl: undefined,
    isLoading: false,
    loadError: null,
    needsCanvasConnection: false,
  }),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => ({
      accessToken: "access-token",
      user: { name: "Dr. Jane Doe", role: "instructor", has_canvas_token: true },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    }),
  };
});

const mockedFetchStudents = vi.mocked(fetchCourseStudentsWithSubmissionFallback);

function CourseStudentsRoute({
  routeCourse = course,
}: {
  routeCourse?: InstructorCourse;
}) {
  const outletContext: InstructorCourseOutletContext = {
    localCourseId: routeCourse.id,
    course: routeCourse,
    canvasUrl: routeCourse.canvasUrl,
    isLoading: false,
    loadError: null,
    needsCanvasConnection: false,
    embedded: true,
  };

  return (
    <Routes>
      <Route path="/" element={<Outlet context={outletContext} />}>
        <Route index element={<InstructorCourseStudentsPage />} />
      </Route>
    </Routes>
  );
}

describe("InstructorCourseStudentsPage", () => {
  it("loads students when the course context has a Canvas URL", async () => {
    mockedFetchStudents.mockResolvedValue([
      {
        id: 1,
        canvas_user_id: "101",
        course_id: course.id,
        name: "Alex Student",
        sortable_name: "Student, Alex",
        login_id: "alex@example.edu",
        enrollment_state: "active",
      },
    ]);

    renderWithRouter(<CourseStudentsRoute />);

    expect(await screen.findByText("Alex Student")).toBeInTheDocument();
    expect(screen.getByText("alex@example.edu")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        course.canvasUrl,
        course.studentCount,
      );
    });
  });

  it("loads students by local course id when the course context has no Canvas URL", async () => {
    // Regression coverage for embedded course tabs: the header can have a
    // student count even when the outlet context omits Canvas metadata.
    const courseWithoutCanvasUrl = { ...course, canvasUrl: undefined };
    mockedFetchStudents.mockResolvedValue([
      {
        id: 2,
        canvas_user_id: "202",
        course_id: course.id,
        name: "Jordan Student",
        sortable_name: "Student, Jordan",
        login_id: "jordan@example.edu",
        enrollment_state: "active",
      },
    ]);

    renderWithRouter(<CourseStudentsRoute routeCourse={courseWithoutCanvasUrl} />);

    expect(await screen.findByText("Jordan Student")).toBeInTheDocument();
    expect(screen.getByText("jordan@example.edu")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        undefined,
        course.studentCount,
      );
    });
  });

  it("passes the expected course count so empty rosters can fall back to submissions", async () => {
    mockedFetchStudents.mockResolvedValue([
      {
        id: 303,
        canvas_user_id: "303",
        course_id: course.id,
        name: "MN Student",
        sortable_name: null,
        login_id: null,
        enrollment_state: "active",
      },
    ]);

    renderWithRouter(<CourseStudentsRoute />);

    expect(await screen.findByText("MN Student")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        course.canvasUrl,
        course.studentCount,
      );
    });
  });
});
