import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Outlet, Route, Routes } from "react-router-dom";

import { institutionCourseData } from "@/data/institutionCourseData";
import {
  mockMessageDraft,
  mockMessageTemplates,
} from "@/data/mockMessageDraft";
import { InstructorCourseMessagesPage } from "@/pages/Instructor/InstructorCourse/InstructorCourseMessagesPage";
import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";
import { fetchMessageDraft, sendMessageDraft } from "@/services/messageDraft";
import { listMessageTemplates } from "@/services/messageTemplates";
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

vi.mock("@/services/messageTemplates", () => ({
  MessageTemplateApiError: class MessageTemplateApiError extends Error {
    name = "MessageTemplateApiError";
  },
  listMessageTemplates: vi.fn(),
  createMessageTemplate: vi.fn(),
  updateMessageTemplate: vi.fn(),
  deleteMessageTemplate: vi.fn(),
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
const mockedSendDraft = vi.mocked(sendMessageDraft);
const mockedFetchStudents = vi.mocked(fetchCourseStudentsWithSubmissionFallback);
const mockedListTemplates = vi.mocked(listMessageTemplates);

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
  beforeEach(() => {
    mockedListTemplates.mockResolvedValue([...mockMessageTemplates]);
  });

  // Verifies: Loads course recipients and renders the message draft editor.
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
      "Course Announcement",
    );
    expect(screen.getByText("Alex Student")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Course Announcement/i }),
      ).toHaveAttribute("aria-current", "true");
    });

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

  it("sends a course announcement when Course Announcement is selected", async () => {
    const user = userEvent.setup();
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
    mockedSendDraft.mockResolvedValue();

    renderWithRouter(<CourseMessagesRoute />);

    await user.click(await screen.findByRole("button", { name: /Course Announcement/i }));
    expect(
      screen.getByText("No students selected — this will be a public course announcement."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Send$/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^Send$/ }));
    expect(
      await screen.findByText(/whole course as an announcement/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm Send" }));

    await waitFor(() => {
      expect(mockedSendDraft).toHaveBeenCalledWith(
        "access-token",
        expect.objectContaining({
          recipientIds: [],
          recipients: [],
        }),
      );
    });
  });

  it("switches back to Assignment Reminder when students are selected", async () => {
    const user = userEvent.setup();
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

    await screen.findByRole("button", { name: /Course Announcement/i });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Course Announcement/i }),
      ).toHaveAttribute("aria-current", "true");
    });

    await user.click(screen.getByRole("checkbox", { name: /Alex Student/i }));

    expect(
      screen.getByRole("button", { name: /Assignment Reminder/i }),
    ).toHaveAttribute("aria-current", "true");
  });

  // Verifies: Loads recipients when the course has a Canvas URL but no Canvas course id.
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

  // Verifies: Loads recipients by local course id when the course context has no Canvas URL.
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
