import { describe, expect, it } from "vitest";

import { buildSuggestedActions } from "@/data/assistantSeedData";

describe("buildSuggestedActions", () => {
  it("references the real active course name in every prompt", () => {
    const actions = buildSuggestedActions("COSC 501");

    expect(actions.map((action) => action.prompt)).toEqual([
      "Show missing submissions for COSC 501",
      "Summarize the most recent quiz results for COSC 501",
      "Show late assignments in COSC 501",
      "View course performance for COSC 501",
    ]);
  });

  it("falls back to a generic prompt with no fabricated course or assignment when there's no active course", () => {
    const actions = buildSuggestedActions(undefined);

    for (const action of actions) {
      // Regression check: these prompts previously had "Assignment 3",
      // "Quiz 2", and "COSC 499" hardcoded in, none of which correspond
      // to anything in a real instructor's account.
      expect(action.prompt).not.toMatch(/Assignment 3|Quiz 2|COSC 499/);
    }

    expect(actions.map((action) => action.prompt)).toEqual([
      "Show missing submissions",
      "Summarize the most recent quiz results",
      "Show late assignments",
      "View course performance",
    ]);
  });
});
