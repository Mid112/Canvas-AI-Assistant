import { describe, expect, it } from "vitest";

import { resolveQuickAction } from "@/lib/quick-actions";
import { buildSuggestedActions } from "@/data/assistantSeedData";
import { paths } from "@/routes/paths";
import { sharedDashboardQuickActions } from "@/types/dashboard";

describe("resolveQuickAction", () => {
  it("sends the three creator actions to their own pages", () => {
    expect(resolveQuickAction("create-assignment")).toEqual({
      kind: "navigate",
      path: paths.instructor.assignmentCreate,
    });
    expect(resolveQuickAction("create-quiz")).toEqual({
      kind: "navigate",
      path: paths.instructor.quizCreate,
    });
    expect(resolveQuickAction("create-feedback")).toEqual({
      kind: "navigate",
      path: paths.instructor.feedbackCreate,
    });
  });

  it("names the active course in prompt-backed actions when it is known", () => {
    expect(resolveQuickAction("grade-analysis", "COSC 501")).toEqual({
      kind: "prompt",
      prompt:
        "Analyse missing submissions for COSC 501. Show the overview and " +
        "list the students who haven't submitted.",
    });
    expect(resolveQuickAction("draft-announcement", "COSC 501")).toEqual({
      kind: "prompt",
      prompt:
        "Draft a student message or course announcement for COSC 501. " +
        "Propose a send_message action I can review and edit before sending.",
    });
  });

  // Regression check (#1441): these prompts once had "Assignment 3", "Quiz 2"
  // and "COSC 499" hardcoded, none of which exist in a real account. With no
  // active course the prompt must defer to the assistant, not invent a name.
  it("defers to the assistant rather than naming a course it does not have", () => {
    for (const id of ["grade-analysis", "draft-announcement"]) {
      const behaviour = resolveQuickAction(id);
      expect(behaviour?.kind).toBe("prompt");
      const prompt = (behaviour as { prompt: string }).prompt;
      expect(prompt).toContain("my active course");
      expect(prompt).not.toMatch(/Assignment 3|Quiz 2|COSC \d/);
    }
  });

  // A whitespace-only label is as good as no label; falling through to the
  // generic phrasing beats asking the assistant about a course called " ".
  it("treats a blank course label as no course at all", () => {
    expect(resolveQuickAction("grade-analysis", "   ")).toEqual(
      resolveQuickAction("grade-analysis"),
    );
  });

  it("returns null for unknown ids so callers keep their own fallback", () => {
    expect(resolveQuickAction("custom-action")).toBeNull();
  });
});

// The bug this branch fixes: the assistant kept its own action table, so
// "create-assignment" opened the creator from the dashboard but only started
// a chat turn from the assistant, and the analytics action had a different id
// on each surface ("course-analytics" vs "grade-analysis"). Both surfaces now
// resolve through the same module, so parity is checked by construction.
describe("dashboard / assistant quick action parity", () => {
  const dashboardIds = new Set(
    sharedDashboardQuickActions.map((action) => action.id),
  );

  it("gives every assistant action an id the dashboard also offers", () => {
    for (const action of buildSuggestedActions()) {
      expect(dashboardIds).toContain(action.id);
    }
  });

  it("resolves every dashboard action to a defined behaviour", () => {
    for (const action of sharedDashboardQuickActions) {
      expect(resolveQuickAction(action.id)).not.toBeNull();
    }
  });

  it("labels the missing-submissions action identically on both surfaces", () => {
    const assistant = buildSuggestedActions().find(
      (action) => action.id === "grade-analysis",
    );
    const dashboard = sharedDashboardQuickActions.find(
      (action) => action.id === "grade-analysis",
    );

    expect(assistant?.title).toBe(dashboard?.title);
    expect(assistant?.title).toBe("Analyse Missing Submissions");
  });
});
