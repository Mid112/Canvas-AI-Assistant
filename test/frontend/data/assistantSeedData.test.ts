import { describe, expect, it } from "vitest";

import { buildSuggestedActions } from "@/data/assistantSeedData";

describe("buildSuggestedActions", () => {
  it("covers assignment, quiz, missing submissions, and message actions", () => {
    const actions = buildSuggestedActions();

    expect(actions).toHaveLength(4);
    // Dashboard ids, not this surface's own: the assistant used to call these
    // "course-analytics" and "draft-student-message", which is what let the two
    // surfaces route the same button to different places.
    expect(actions.map((action) => action.id)).toEqual([
      "create-assignment",
      "create-quiz",
      "analyse-missing-submissions",
      "draft-announcement",
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
