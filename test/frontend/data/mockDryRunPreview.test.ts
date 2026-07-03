import { describe, expect, it } from "vitest";

import {
  mockAssignmentUpdatePreview,
  mockDryRunPreviews,
  mockStudentReminderPreview,
} from "@/data/mockDryRunPreview";

describe("mockDryRunPreview", () => {
  it("includes the default student reminder workflow", () => {
    expect(mockStudentReminderPreview.title).toBe("Workflow Preview");
    expect(mockStudentReminderPreview.actionType).toBe("Send Message");
    expect(mockStudentReminderPreview.reversibility).toBe("irreversible");
  });

  it("includes an assignment update workflow variant", () => {
    expect(mockAssignmentUpdatePreview.actionType).toBe("Update");
    expect(mockAssignmentUpdatePreview.affectedResources.students).toEqual({
      count: 124,
    });
  });

  it("indexes previews by id", () => {
    expect(mockDryRunPreviews[mockStudentReminderPreview.id]).toBeDefined();
    expect(mockDryRunPreviews[mockAssignmentUpdatePreview.id]).toBeDefined();
  });
});
