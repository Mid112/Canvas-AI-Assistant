import { describe, expect, it } from "vitest";

import { buildSuggestedActions } from "@/data/assistantSeedData";

describe("buildSuggestedActions", () => {
  it("covers assignment, quiz, missing submissions, and message actions", () => {
    const actions = buildSuggestedActions();

    expect(actions).toHaveLength(4);
    // Shared ids wherever the two surfaces mean the same thing — the assistant
    // used to call the analytics action "course-analytics", which is what let
    // the same button route to different places.
    //
    // draft-student-message is the exception, and deliberately so: this
    // surface offers a student message where the dashboard offers an
    // announcement. They had shared draft-announcement, and the shared
    // behaviour then had to be wrong for one of them.
    expect(actions.map((action) => action.id)).toEqual([
      "create-assignment",
      "create-quiz",
      "analyse-missing-submissions",
      "draft-student-message",
    ]);
  });

  it("titles the analysis action for the read that actually backs it", () => {
    const analysis = buildSuggestedActions().find(
      (action) => action.id === "analyse-missing-submissions",
    );

    // "Analyze course performance" promised a broader analysis than the
    // missing-submissions read behind it delivers (#12).
    expect(analysis?.title).toBe("Analyse Missing Submissions");
    expect(analysis?.description).toBe("See who hasn't submitted");
  });

  it("carries no prompt of its own, so routing stays in one place", () => {
    for (const action of buildSuggestedActions()) {
      expect(action).not.toHaveProperty("prompt");
    }
  });
});
