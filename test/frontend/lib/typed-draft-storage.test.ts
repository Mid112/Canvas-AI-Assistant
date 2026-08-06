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

  // Regression for #1506: scored per-question points must survive save and
  // resume as priorQuestionPoints so Generate can restore them.
  it("stores quiz questionPoints and resumes them as priorQuestionPoints", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Cell Biology",
        questions: "Q1\nQ2",
        questionPoints: [10, 10],
        pointsPossible: 20,
      },
    });

    expect(draft.content.questionPoints).toEqual([10, 10]);
    expect(listTypedDrafts(7)[0]?.content.questionPoints).toEqual([10, 10]);

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    const seeded = target.state.aiQuizDraft as {
      priorQuestionPoints?: number[];
      pointsPossible?: number;
    };
    expect(seeded.priorQuestionPoints).toEqual([10, 10]);
    expect(seeded.pointsPossible).toBe(20);
  });

  // Regression for #1505: a draft saved AFTER generation must carry its
  // structured questions through, not a newline-joined dump of question
  // text stuffed into the description/prompt.
  it("persists a generated quiz draft's structured questions (#1505)", () => {
    const questions = [
      {
        questionText: "What is 2 + 2?",
        questionType: "multiple_choice_question" as const,
        pointsPossible: 1,
        answers: [
          { text: "3", weight: 0 },
          { text: "4", weight: 100 },
        ],
      },
    ];
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Midterm",
        body: "Covers chapters 1-3",
        quizQuestions: questions,
        dueDate: "2026-08-15T23:59:00",
        pointsPossible: 20,
        allowedAttempts: 2,
        timeLimit: 30,
      },
    });

    expect(draft.content.quizQuestions).toEqual(questions);
    // The description is the instructor/generator's own text — it must not
    // be replaced by a dump of the question texts.
    expect(draft.content.body).toBe("Covers chapters 1-3");
  });

  // Regression for #1505: resuming a draft with structured questions must
  // land the create page on review (via aiQuizDraft.questions), not
  // re-describe with the question text jammed into the prompt.
  it("builds quiz resume targets that land on review with structured questions (#1505)", () => {
    const questions = [
      {
        questionText: "What is 2 + 2?",
        questionType: "multiple_choice_question" as const,
        pointsPossible: 1,
        answers: [
          { text: "3", weight: 0 },
          { text: "4", weight: 100 },
        ],
      },
    ];
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Midterm",
        body: "Covers chapters 1-3",
        quizQuestions: questions,
        dueDate: "2026-08-15T23:59:00",
        pointsPossible: 20,
        allowedAttempts: 2,
        timeLimit: 30,
      },
    });

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    expect(target).toEqual({
      path: paths.instructor.quizCreate,
      state: {
        typedDraftId: draft.id,
        aiQuizDraft: {
          courseId: 42,
          name: "Midterm",
          description: "Covers chapters 1-3",
          questions,
          dueDate: "2026-08-15T23:59:00",
          pointsPossible: 20,
          allowedAttempts: 2,
          timeLimit: 30,
        },
      },
    });
    // The description must be the original text, never the question dump
    // that used to land here (#1505's reported symptom).
    const aiQuizDraft = target.state.aiQuizDraft as { description: string };
    expect(aiQuizDraft.description).not.toContain("What is 2 + 2?");
  });

  // A quiz with no structured questions saved (prompt-only, or a generated
  // draft with an empty question list) must still fall back to describe —
  // hasStructuredQuestions requires a non-empty array, not just presence.
  it("falls back to describe when a quiz draft's structured questions are empty", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: { title: "Midterm", body: "No questions yet", quizQuestions: [] },
    });

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    const aiQuizDraft = target.state.aiQuizDraft as Record<string, unknown>;
    expect(aiQuizDraft).not.toHaveProperty("questions");
  });

  // Verifies: a quiz draft keeps the instructor's own attempt limit and
  // timer. stripCanvasIdentifiers is a hard whitelist, so a field added to
  // TypedDraftContent but not to it is dropped on save with no error — the
  // same way the due date was lost before (#6).
  it("stores a quiz draft's allowed attempts and time limit", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Midterm",
        questions: "Q1",
        allowedAttempts: 3,
        timeLimit: 45,
      },
    });

    expect(draft.content.allowedAttempts).toBe(3);
    expect(draft.content.timeLimit).toBe(45);
    expect(listTypedDrafts(7)[0]?.content.allowedAttempts).toBe(3);
    expect(listTypedDrafts(7)[0]?.content.timeLimit).toBe(45);
  });

  // Verifies: question-bank picks persist by name only — never Canvas bankId
  // (#1239 / #1505 review).
  it("strips Canvas bankId from quizQuestionBankGroups on save", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Banks Quiz",
        body: "With banks",
        quizQuestions: [
          {
            questionText: "Q1",
            questionType: "essay_question",
            pointsPossible: 1,
            answers: [],
          },
        ],
        // Live form groups include bankId; strip must drop it before persist.
        quizQuestionBankGroups: [
          {
            bankName: "Chapter 1 Bank",
            pickCount: 2,
            questionPoints: 5,
            bankId: 31,
          },
        ] as TypedDraftContent["quizQuestionBankGroups"],
      },
    });

    expect(draft.content.quizQuestionBankGroups).toEqual([
      {
        bankName: "Chapter 1 Bank",
        pickCount: 2,
        questionPoints: 5,
      },
    ]);
    expect(
      JSON.stringify(listTypedDrafts(7)[0]?.content.quizQuestionBankGroups),
    ).not.toContain('"bankId"');

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    const groups = (
      target.state.aiQuizDraft as {
        questionBankGroups?: Array<{ bankId: number; bankName: string }>;
      }
    ).questionBankGroups;
    expect(groups?.[0]?.bankName).toBe("Chapter 1 Bank");
    // Placeholder until the create page rematches by name after banks load.
    expect(groups?.[0]?.bankId).toBe(0);
  });

  // Verifies: null is a choice, not an absence. Unlimited attempts and "no
  // time limit" have to round-trip, or resuming quietly reinstates whatever
  // the generator defaults to.
  it("keeps a quiz draft's null attempt limit and timer", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: {
        title: "Midterm",
        questions: "Q1",
        allowedAttempts: null,
        timeLimit: null,
      },
    });

    expect(draft.content.allowedAttempts).toBeNull();
    expect(draft.content.timeLimit).toBeNull();

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    const seeded = (target.state as {
      aiQuizDraft: { allowedAttempts?: unknown; timeLimit?: unknown };
    }).aiQuizDraft;
    expect(seeded.allowedAttempts).toBeNull();
    expect(seeded.timeLimit).toBeNull();
  });

  // Verifies: a draft that never set them stays absent, so the generated
  // values are left alone rather than being overwritten with a null.
  it("omits attempts and time limit when the quiz draft never set them", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: { title: "Midterm", questions: "Q1" },
    });

    expect("allowedAttempts" in draft.content).toBe(false);
    expect("timeLimit" in draft.content).toBe(false);

    const seeded = (
      buildTypedDraftResumeTarget(draft, { courseId: 42 }).state as {
        aiQuizDraft: Record<string, unknown>;
      }
    ).aiQuizDraft;
    expect("allowedAttempts" in seeded).toBe(false);
    expect("timeLimit" in seeded).toBe(false);
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
