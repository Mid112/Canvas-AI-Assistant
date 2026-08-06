// Test note: covers the assistant seed data.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { buildSuggestedActions } from "@/data/assistantSeedData";

describe("buildSuggestedActions", () => {
  it("covers assignment, quiz, analytics, and message starter prompts", () => {
    const actions = buildSuggestedActions("COSC 501");

    expect(actions).toHaveLength(4);
    expect(actions.map((action) => action.id)).toEqual([
      "create-assignment",
      "create-quiz",
      "course-analytics",
      "draft-student-message",
    ]);
    expect(actions.map((action) => action.prompt)).toEqual([
      "Help me create an assignment in COSC 501. Ask for any missing details, then propose a create_assignment preview I can review.",
      "Help me create a quiz in COSC 501. Propose a create_quiz preview I can review in the quiz creator.",
      "Show missing submissions and course performance for COSC 501",
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
      "Help me create an assignment. Ask for any missing details, then propose a create_assignment preview I can review.",
      "Help me create a quiz. Propose a create_quiz preview I can review in the quiz creator.",
      "Show missing submissions and course performance",
      "Draft a message to students about an upcoming deadline. Propose a send_message action I can review and edit before sending.",
    ]);
  });
});
