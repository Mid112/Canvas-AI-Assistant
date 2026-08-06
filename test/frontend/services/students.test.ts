// Test note: covers the students.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCourseAssignments } from "@/services/assignments";
import {
  fetchCourseStudents,
  fetchCourseStudentsWithSubmissionFallback,
} from "@/services/students";
import { fetchAssignmentSubmissions } from "@/services/submissions";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

vi.mock("@/services/assignments", () => ({
  fetchCourseAssignments: vi.fn(),
}));

vi.mock("@/services/submissions", () => ({
  fetchAssignmentSubmissions: vi.fn(),
}));

const mockedFetchAssignments = vi.mocked(fetchCourseAssignments);
const mockedFetchSubmissions = vi.mocked(fetchAssignmentSubmissions);

describe("students service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedFetchAssignments.mockReset();
    mockedFetchSubmissions.mockReset();
  });

  // Verifies: Fetches course students from the roster endpoint.
  it("fetches course students from the roster endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            canvas_user_id: "101",
            course_id: 7,
            name: "Alex Student",
            sortable_name: "Student, Alex",
            login_id: "alex@example.edu",
            enrollment_state: "active",
          },
        ]),
        { status: 200 },
      ),
    );

    const students = await fetchCourseStudents(
      7,
      "access-token",
      "https://canvas.example.edu",
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/canvas/courses/7/students?canvas_url=https%3A%2F%2Fcanvas.example.edu",
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(students).toHaveLength(1);
  });

  // Verifies: Derives students from submissions when the roster is empty but the course has students.
  it("derives students from submissions when the roster is empty but the course has students", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    mockedFetchAssignments.mockResolvedValue([
      {
        id: 10,
        name: "MMM",
        description: null,
        due_at: null,
        points_possible: null,
        course_id: 7,
      },
      {
        id: 11,
        name: "Project",
        description: null,
        due_at: null,
        points_possible: null,
        course_id: 7,
      },
    ]);
    mockedFetchSubmissions
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 100,
          assignment_id: 11,
          user_id: 303,
          student_name: "MN Student",
          student_email: "mn@example.edu",
          student_login_id: "mn@example.edu",
          submitted_at: null,
          workflow_state: "unsubmitted",
          status: "missing",
          score: null,
          grade: null,
          graded_at: null,
        },
      ]);

    const students = await fetchCourseStudentsWithSubmissionFallback(
      7,
      "access-token",
      "https://canvas.example.edu",
      2,
    );

    expect(students).toEqual([
      expect.objectContaining({
        canvas_user_id: "303",
        name: "MN Student",
        login_id: "mn@example.edu",
      }),
    ]);
    expect(mockedFetchAssignments).toHaveBeenCalledWith(
      7,
      "access-token",
      "https://canvas.example.edu",
    );
    expect(mockedFetchSubmissions).toHaveBeenCalledWith(
      7,
      10,
      "access-token",
      "https://canvas.example.edu",
    );
    expect(mockedFetchSubmissions).toHaveBeenCalledWith(
      7,
      11,
      "access-token",
      "https://canvas.example.edu",
    );
  });

  it("throws StudentApiError when the roster request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Course not found" }), {
        status: 404,
      }),
    );

    await expect(fetchCourseStudents(7, "access-token")).rejects.toMatchObject({
      name: "StudentApiError",
      status: 404,
      message: "Course not found",
    });
  });

  it("returns roster students without fallback when expected count is zero", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const students = await fetchCourseStudentsWithSubmissionFallback(
      7,
      "access-token",
      "https://canvas.example.edu",
      0,
    );

    expect(students).toEqual([]);
    expect(mockedFetchAssignments).not.toHaveBeenCalled();
  });

  it("returns an empty list when no assignments exist for submission fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    mockedFetchAssignments.mockResolvedValue([]);

    const students = await fetchCourseStudentsWithSubmissionFallback(
      7,
      "access-token",
      "https://canvas.example.edu",
      5,
    );

    expect(students).toEqual([]);
    expect(mockedFetchSubmissions).not.toHaveBeenCalled();
  });
});
