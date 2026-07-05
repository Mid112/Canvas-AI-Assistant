import { describe, expect, it } from "vitest";

import { mapIntentPreviewToDryRun } from "@/lib/map-intent-preview-to-dry-run";
import type { ConversationMessage } from "@/services/assistant";

describe("mapIntentPreviewToDryRun", () => {
  const messages: ConversationMessage[] = [
    {
      id: 10,
      role: "user",
      content: "Create a midterm exam for CPSC 310",
      created_at: "2026-07-05T00:00:00.000Z",
    },
    {
      id: 42,
      role: "assistant",
      content: JSON.stringify({
        action: "intent_preview",
        intent_preview: true,
        summary: "Create assignment Midterm Exam in CPSC 310.",
        proposed_action: {
          action: "create_assignment",
          title: "Midterm Exam",
        },
        preview_metadata: {
          action: "create_assignment",
          course: "CPSC 310",
          summary: "Create assignment 'Midterm Exam' in CPSC 310.",
          metadata: {
            title: "Midterm Exam",
            due_date: "August 01, 2026 at 11:59 PM",
          },
          affected_resources: [
            { type: "course", id: 1, name: "CPSC 310", status: "unchanged" },
            {
              type: "assignment",
              id: null,
              name: "Midterm Exam",
              status: "created",
            },
          ],
          reversible: false,
          reversibility_note: "This action cannot be undone once submitted.",
        },
      }),
      created_at: "2026-07-05T00:01:00.000Z",
    },
  ];

  it("maps a stored intent preview message into dry-run preview data", () => {
    expect(
      mapIntentPreviewToDryRun(7, 42, messages, "Dr. Jane Doe"),
    ).toMatchObject({
      id: "chat-7-42",
      originalRequest: "Create a midterm exam for CPSC 310",
      requestedBy: "Dr. Jane Doe",
      summary: "Create assignment Midterm Exam in CPSC 310.",
      actionType: "Create",
      affectedResources: {
        course: { name: "CPSC 310", id: "1" },
        assignment: {
          name: "Midterm Exam",
          id: "assignment",
          dueDate: "August 01, 2026 at 11:59 PM",
        },
      },
      reversibility: "irreversible",
    });
  });
});
