import { describe, expect, it } from "vitest";

import { buildSuggestedActions } from "@/data/assistantSeedData";

describe("buildSuggestedActions", () => {
  it("references the real active course name in every prompt", () => {
    const actions = buildSuggestedActions("COSC 501");

    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.prompt)).toEqual([
      "Show missing submissions for COSC 501",
      "Show late assignments in COSC 501",
      "View course performance for COSC 501",
      "Draft a message to students in COSC 501 about an upcoming deadline. Propose a send_message action I can review and edit before sending.",
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
      "Show late assignments",
      "View course performance",
      "Draft a message to students about an upcoming deadline. Propose a send_message action I can review and edit before sending.",
    ]);
  });
});
