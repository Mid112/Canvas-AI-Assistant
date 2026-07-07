import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Outlet, Route, Routes } from "react-router-dom";

import { institutionCourseData } from "@/data/institutionCourseData";
import { mockMessageDraft } from "@/data/mockMessageDraft";
import { InstructorCourseMessagesPage } from "@/pages/Instructor/InstructorCourse/InstructorCourseMessagesPage";
import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";
import { fetchMessageDraft } from "@/services/messageDraft";
import { fetchCourseStudents } from "@/services/students";
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
  fetchCourseStudents: vi.fn(),
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
const mockedFetchStudents = vi.mocked(fetchCourseStudents);

function CourseMessagesRoute() {
  const outletContext: InstructorCourseOutletContext = {
    localCourseId: course.id,
    course,
    canvasUrl: course.canvasUrl,
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
        canvas_user_id: "101",
        name: "Alex Student",
        login_id: "alex@example.edu",
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
        course.canvasCourseId,
        "access-token",
        course.canvasUrl,
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
});
