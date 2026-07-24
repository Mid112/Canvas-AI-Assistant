import { beforeEach, describe, expect, it } from "vitest";

import {
  buildTypedDraftResumeTarget,
  discardTypedDraft,
  listTypedDrafts,
  saveTypedDraft,
  type TypedDraftContent,
} from "@/lib/typed-draft-storage";
import { paths } from "@/routes/paths";

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

  it("builds resume targets that require course selection", () => {
    const draft = saveTypedDraft(7, {
      kind: "quiz",
      content: { title: "Midterm", questions: "Q1" },
    });

    expect(buildTypedDraftResumeTarget(draft)).toEqual({
      path: paths.instructor.quizCreate,
      state: {
        aiQuizDraft: {
          title: "Midterm",
          description: "",
          questionsText: "Q1",
          requireCourseSelection: true,
        },
      },
    });

    discardTypedDraft(7, draft.id);
    expect(listTypedDrafts(7)).toHaveLength(0);
  });
});
