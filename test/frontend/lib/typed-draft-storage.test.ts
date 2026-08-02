import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildTypedDraftResumeTarget,
  discardTypedDraft,
  listTypedDrafts,
  resolveTypedDraftCourseId,
  saveTypedDraft,
  type TypedDraftContent,
} from "@/lib/typed-draft-storage";
import { instructorMessagesPath, paths } from "@/routes/paths";

describe("typed-draft-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores content-only drafts without canvas identifiers", () => {
    const contentWithIds = {
      title: "Lab 1",
      body: "Write tests",
      courseId: 99,
      local_course_id: 12,
    } as TypedDraftContent;

    const draft = saveTypedDraft(7, {
      kind: "assignment",
      content: contentWithIds,
    });

    expect(draft.content).toEqual({ title: "Lab 1", body: "Write tests" });
    expect(listTypedDrafts(7)).toHaveLength(1);
  });

  it("builds assignment resume targets with name and courseId", () => {
    const draft = saveTypedDraft(7, {
      kind: "assignment",
      content: { title: "Lab 1", body: "Write tests" },
    });

    expect(buildTypedDraftResumeTarget(draft, { courseId: 42 })).toEqual({
      path: paths.instructor.assignmentCreate,
      state: {
        typedDraftId: draft.id,
        aiAssignmentDraft: {
          courseId: 42,
          name: "Lab 1",
          description: "Write tests",
        },
      },
    });
  });

  it("carries dueDate and pointsPossible through an assignment resume target (#6)", () => {
    const draft = saveTypedDraft(7, {
      kind: "assignment",
      content: {
        title: "Lab 1",
        body: "Write tests",
        dueDate: "2026-08-15T23:59:00",
        pointsPossible: 50,
      },
    });

    expect(draft.content).toEqual({
      title: "Lab 1",
      body: "Write tests",
      dueDate: "2026-08-15T23:59:00",
      pointsPossible: 50,
    });

    expect(buildTypedDraftResumeTarget(draft, { courseId: 42 })).toEqual({
      path: paths.instructor.assignmentCreate,
      state: {
        typedDraftId: draft.id,
        aiAssignmentDraft: {
          courseId: 42,
          name: "Lab 1",
          description: "Write tests",
          dueDate: "2026-08-15T23:59:00",
          pointsPossible: 50,
        },
      },
    });
  });

  it("resumes prompt-only assignment drafts to describe (no empty review)", () => {
    const draft = saveTypedDraft(7, {
      kind: "assignment",
      content: { body: "Create a midterm with rubric" },
    });

    expect(buildTypedDraftResumeTarget(draft, { courseId: 42 })).toEqual({
      path: paths.instructor.assignmentCreate,
      state: {
        typedDraftId: draft.id,
        aiAssignmentDraft: {
          courseId: 42,
          name: "",
          description: "",
          prompt: "Create a midterm with rubric",
        },
      },
    });
  });

  it("builds quiz resume targets that land on describe with free-text questions", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: { title: "Midterm", questions: "Q1\nQ2" },
    });

    expect(buildTypedDraftResumeTarget(draft, { courseId: 42 })).toEqual({
      path: paths.instructor.quizCreate,
      state: {
        typedDraftId: draft.id,
        aiQuizDraft: {
          courseId: 42,
          name: "Midterm",
          description: "",
          prompt: 'Create a quiz titled "Midterm"\n\nQ1\nQ2',
        },
      },
    });
  });

  it("builds feedback resume targets without NaN ids", () => {
    const draft = saveTypedDraft(7, {
      kind: "feedback",
      content: {
        assignmentName: "Essay 1",
        studentName: "Alex",
        grade: "85",
        feedback: "Nice work",
      },
    });

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    expect(target.path).toBe(paths.instructor.feedbackCreate);
    expect(target.state).toEqual({
      typedDraftId: draft.id,
      aiFeedbackDraft: {
        courseId: 42,
        assignmentName: "Essay 1",
        studentName: "Alex",
        newGrade: "85",
        feedback: "Nice work",
        prompt:
          "Assignment: Essay 1\n\nStudent: Alex\n\nGrade: 85\n\nNice work",
      },
    });
    const feedbackDraft = target.state.aiFeedbackDraft as Record<string, unknown>;
    expect(feedbackDraft).not.toHaveProperty("assignmentId");
    expect(feedbackDraft).not.toHaveProperty("studentId");
  });

  it("builds message resume targets with typedDraftId", () => {
    const draft = saveTypedDraft(7, {
      kind: "message",
      content: { title: "Hello", body: "Class update" },
    });

    expect(buildTypedDraftResumeTarget(draft, { courseId: 42 })).toEqual({
      path: instructorMessagesPath({ tab: "compose" }),
      state: {
        typedDraftId: draft.id,
        aiMessageDraft: {
          courseId: 42,
          subject: "Hello",
          body: "Class update",
        },
      },
    });
  });

  it("does not discard drafts when building a resume target", () => {
    const draft = saveTypedDraft(7, {
      kind: "assignment",
      content: { title: "Keep me", body: "Still here" },
    });

    buildTypedDraftResumeTarget(draft, { courseId: 42 });
    expect(listTypedDrafts(7)).toHaveLength(1);
    expect(listTypedDrafts(7)[0]?.id).toBe(draft.id);
  });

  it("swallows localStorage setItem failures on save and discard", () => {
    const draft = saveTypedDraft(7, {
      kind: "message",
      content: { title: "Temp", body: "Body" },
    });
    expect(listTypedDrafts(7)).toHaveLength(1);

    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    expect(() =>
      saveTypedDraft(7, {
        kind: "message",
        content: { title: "Another", body: "Body" },
      }),
    ).not.toThrow();
    expect(() => discardTypedDraft(7, draft.id)).not.toThrow();

    setItem.mockRestore();
  });

  it("discards drafts when explicitly requested", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: { title: "Midterm", questions: "Q1" },
    });

    discardTypedDraft(7, draft.id);
    expect(listTypedDrafts(7)).toHaveLength(0);
  });

  // A draft's course has to survive the round-trip through local storage
  // without ever storing an id (#1239), so it is kept as the two labels
  // Canvas already displays and resolved back to an id at resume time.
  describe("course binding", () => {
    const courses = [
      { id: 3, code: "COSC 499", name: "Capstone Project" },
      { id: 4, code: "MATH 101", name: "Calculus" },
    ];

    it("persists course labels but still strips identifiers", () => {
      const draft = saveTypedDraft(7, {
        kind: "assignment",
        content: {
          title: "Lab 1",
          courseCode: "COSC 499",
          courseName: "Capstone Project",
          courseId: 3,
        } as TypedDraftContent,
      });

      expect(draft.content).toEqual({
        title: "Lab 1",
        courseCode: "COSC 499",
        courseName: "Capstone Project",
      });
      expect(listTypedDrafts(7)[0].content.courseCode).toBe("COSC 499");
    });

    it("resolves a stored course by code", () => {
      expect(
        resolveTypedDraftCourseId(
          { courseCode: "COSC 499", courseName: "Capstone Project" },
          courses,
        ),
      ).toBe(3);
    });

    it("ignores case and spacing differences in the stored code", () => {
      expect(
        resolveTypedDraftCourseId({ courseCode: "  cosc  499 " }, courses),
      ).toBe(3);
    });

    // The whole point of keeping both labels: a rename between save and
    // resume leaves the code intact, so the draft still finds its course.
    it("still resolves after the course was renamed", () => {
      expect(
        resolveTypedDraftCourseId(
          { courseCode: "COSC 499", courseName: "Capstone Project" },
          [{ id: 3, code: "COSC 499", name: "Senior Design" }],
        ),
      ).toBe(3);
    });

    // ...and the mirror case, where the course was re-coded instead.
    it("falls back to the name when the code no longer matches", () => {
      expect(
        resolveTypedDraftCourseId(
          { courseCode: "COSC 499", courseName: "Capstone Project" },
          [{ id: 3, code: "COSC 599", name: "Capstone Project" }],
        ),
      ).toBe(3);
    });

    it("returns undefined when the course is gone entirely", () => {
      expect(
        resolveTypedDraftCourseId(
          { courseCode: "PHYS 200", courseName: "Mechanics" },
          courses,
        ),
      ).toBeUndefined();
    });

    it("returns undefined for drafts saved before course labels existed", () => {
      expect(resolveTypedDraftCourseId({ title: "Lab 1" }, courses)).toBeUndefined();
    });

    // Two courses sharing a code cannot be told apart from a label, so the
    // caller falls back to the active course rather than picking one.
    it("returns undefined when the code is ambiguous", () => {
      expect(
        resolveTypedDraftCourseId({ courseCode: "COSC 499" }, [
          { id: 3, code: "COSC 499", name: "Capstone Project" },
          { id: 9, code: "COSC 499", name: "Capstone Project (2nd section)" },
        ]),
      ).toBeUndefined();
    });
  });
});
