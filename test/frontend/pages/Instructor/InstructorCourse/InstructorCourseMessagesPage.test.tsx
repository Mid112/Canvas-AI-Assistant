import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Outlet, Route, Routes } from "react-router-dom";

import { institutionCourseData } from "@/data/institutionCourseData";
import { mockMessageDraft } from "@/data/mockMessageDraft";
import { InstructorCourseMessagesPage } from "@/pages/Instructor/InstructorCourse/InstructorCourseMessagesPage";
import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";
import { fetchMessageDraft } from "@/services/messageDraft";
import { fetchCourseStudentsWithSubmissionFallback } from "@/services/students";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const course = {
  ...institutionCourseData[0]!.courses[0]!,
  canvasCourseId: 42,
  canvasUrl: "https://canvas.example.edu",
};

vi.mock("@/services/messageDraft", () => ({
  MessageDraftApiError: class MessageDraftApiError extends Error {
    name = "MessageDraftApiError";
  },
  isMessageDraftSendMocked: false,
  fetchMessageDraft: vi.fn(),
  sendMessageDraft: vi.fn(),
}));

vi.mock("@/services/students", () => ({
  StudentApiError: class StudentApiError extends Error {
    name = "StudentApiError";
    status = 500;
  },
  fetchCourseStudentsWithSubmissionFallback: vi.fn(),
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

const mockedFetchDraft = vi.mocked(fetchMessageDraft);
const mockedFetchStudents = vi.mocked(fetchCourseStudentsWithSubmissionFallback);

function CourseMessagesRoute({
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
        <Route index element={<InstructorCourseMessagesPage />} />
      </Route>
    </Routes>
  );
}

describe("InstructorCourseMessagesPage", () => {
  it("loads course recipients and renders the message draft editor", async () => {
    mockedFetchStudents.mockResolvedValue([
      {
        id: 1,
        canvas_user_id: "101",
        course_id: course.id,
        name: "Alex Student",
        sortable_name: null,
        login_id: "alex@example.edu",
        enrollment_state: "active",
      },
    ]);
    mockedFetchDraft.mockResolvedValue({
      ...mockMessageDraft,
      recipients: [
        {
          id: "101",
          name: "Alex Student",
          email: "alex@example.edu",
        },
      ],
    });

    renderWithRouter(<CourseMessagesRoute />);

    expect(
      screen.getByText("Preparing course message draft..."),
    ).toBeInTheDocument();

    expect(await screen.findByLabelText("Subject")).toHaveValue(
      mockMessageDraft.subject,
    );
    expect(screen.getByText("Alex Student")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        course.canvasUrl,
        course.studentCount,
      );
      expect(mockedFetchDraft).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          courseId: course.id,
          recipients: [
            {
              id: "101",
              name: "Alex Student",
              email: "alex@example.edu",
            },
          ],
        }),
      );
    });
  });

  it("loads recipients when the course has a Canvas URL but no Canvas course id", async () => {
    const courseWithoutCanvasId = { ...course, canvasCourseId: undefined };
    mockedFetchStudents.mockResolvedValue([
      {
        id: 2,
        canvas_user_id: "202",
        course_id: course.id,
        name: "Taylor Student",
        sortable_name: null,
        login_id: "taylor@example.edu",
        enrollment_state: "active",
      },
    ]);
    mockedFetchDraft.mockResolvedValue({
      ...mockMessageDraft,
      recipients: [
        {
          id: "202",
          name: "Taylor Student",
          email: "taylor@example.edu",
        },
      ],
    });

    renderWithRouter(<CourseMessagesRoute routeCourse={courseWithoutCanvasId} />);

    expect(await screen.findByText("Taylor Student")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        course.canvasUrl,
        course.studentCount,
      );
      expect(mockedFetchDraft).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          courseId: course.id,
          recipients: [
            {
              id: "202",
              name: "Taylor Student",
              email: "taylor@example.edu",
            },
          ],
        }),
      );
    });
  });

  it("loads recipients by local course id when the course context has no Canvas URL", async () => {
    const courseWithoutCanvasMetadata = {
      ...course,
      canvasCourseId: undefined,
      canvasUrl: undefined,
    };
    mockedFetchStudents.mockResolvedValue([
      {
        id: 3,
        canvas_user_id: "303",
        course_id: course.id,
        name: "Jordan Student",
        sortable_name: null,
        login_id: "jordan@example.edu",
        enrollment_state: "active",
      },
    ]);
    mockedFetchDraft.mockResolvedValue({
      ...mockMessageDraft,
      recipients: [
        {
          id: "303",
          name: "Jordan Student",
          email: "jordan@example.edu",
        },
      ],
    });

    renderWithRouter(
      <CourseMessagesRoute routeCourse={courseWithoutCanvasMetadata} />,
    );

    expect(
      screen.getByText("Preparing course message draft..."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Jordan Student")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockedFetchStudents).toHaveBeenCalledWith(
        course.id,
        "access-token",
        undefined,
        course.studentCount,
      );
      expect(mockedFetchDraft).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          courseId: course.id,
          recipients: [
            {
              id: "303",
              name: "Jordan Student",
              email: "jordan@example.edu",
            },
          ],
        }),
      );
    });
  });
});
