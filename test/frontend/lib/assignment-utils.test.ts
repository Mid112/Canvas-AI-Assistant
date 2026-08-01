import { describe, expect, it } from "vitest";

import {
  assignmentToFormValues,
  buildAssignmentChanges,
  formatDueDateForApi,
  formatDueDateForDisplay,
  formatDueDateForInput,
  hasAssignmentChanges,
  parseDueDate,
} from "@/lib/assignment-utils";
import type { Assignment } from "@/types/assignment";

const assignment: Assignment = {
  id: 42,
  name: "Midterm Essay",
  description: "Write about algorithms.",
  due_at: "2026-12-01T23:59:00.000Z",
  points_possible: 100,
  course_id: 7,
  published: true,
};

describe("assignment-utils", () => {
  // Verifies: Maps assignment data to form values.
  it("maps assignment data to form values", () => {
    const values = assignmentToFormValues(assignment);

    expect(values.name).toBe("Midterm Essay");
    expect(values.description).toBe("Write about algorithms.");
    expect(values.dueDate).toMatch(/^2026-/);
  });

  // Verifies: Detects changed fields for preview.
  it("detects changed fields for preview", () => {
    const updated = {
      ...assignmentToFormValues(assignment),
      name: "Updated Essay",
      description: "Revised prompt",
    };

    const changes = buildAssignmentChanges(assignment, updated);

    expect(changes).toHaveLength(2);
    expect(changes[0]?.label).toBe("Title");
    expect(changes[1]?.label).toBe("Description");
    expect(hasAssignmentChanges(assignment, updated)).toBe(true);
  });

  // Verifies: Formats due dates for display.
  it("formats due dates for display", () => {
    expect(formatDueDateForDisplay(null)).toBe("No due date");
    expect(formatDueDateForDisplay("invalid-date")).toBe("invalid-date");
  });

  // Verifies: Naive chat ISO times are treated as UTC, matching backend (#1435).
  it("parses naive ISO due dates as UTC wall-clock", () => {
    const parsed = parseDueDate("2026-08-13T23:59:00");
    expect(parsed?.toISOString()).toBe("2026-08-13T23:59:00.000Z");
  });

  // Verifies: Omitted seconds still round-trip through API conversion.
  it("converts datetime-local values without seconds to UTC ISO", () => {
    const apiValue = formatDueDateForApi("2026-08-13T17:00");
    expect(apiValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(formatDueDateForInput(apiValue)).toMatch(/T\d{2}:\d{2}$/);
  });
});
