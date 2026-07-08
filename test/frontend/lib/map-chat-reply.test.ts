import { describe, expect, it } from "vitest";

import {
  ChatReplyMappingError,
  mapChatReply,
} from "@/lib/map-chat-reply";

describe("mapChatReply", () => {
  // Verifies: Throws for backend error replies.
  it("throws for backend error replies", () => {
    expect(() =>
      mapChatReply({ error: "The assistant took too long to respond." }, true),
    ).toThrow(ChatReplyMappingError);
  });

  // Verifies: Maps out_of_scope replies.
  it("maps out_of_scope replies", () => {
    expect(
      mapChatReply(
        {
          action: "out_of_scope",
          out_of_scope: true,
          message: "Your request is out of scope.",
          detail: "Deleting all students is not supported.",
        },
        false,
      ),
    ).toEqual({
      content: "Your request is out of scope.",
      explanation: "Deleting all students is not supported.",
      safetyBlocked: true,
      safetyMessage: "Deleting all students is not supported.",
    });
  });

  it("never falls back to showing the raw local_course_id when no course name is available", () => {
    const result = mapChatReply(
      {
        action: "intent_preview",
        intent_preview: true,
        summary: "Fetch missing submissions.",
        proposed_action: {
          action: "fetch_submissions",
          local_course_id: 351,
          assignment_id: 5,
        },
        // preview_metadata intentionally omits course_name/course
        preview_metadata: {},
        pending_message_id: 7,
      },
      false,
    );

    expect(result.interpretedAction?.course).toBe("Active course");
    expect(result.interpretedAction?.course).not.toContain("351");
  });

  it("maps clarify replies", () => {
    expect(
      mapChatReply(
        {
          action: "clarify",
          clarify: true,
          question: "Which assignment should I update?",
          partial_plan: {},
        },
        false,
      ),
    ).toEqual({
      content: "Which assignment should I update?",
    });
  });

  // Verifies: Maps intent_preview replies.
  it("maps intent_preview replies", () => {
    expect(
      mapChatReply(
        {
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
            audience: { scope: "entire_class" },
          },
          pending_message_id: 42,
        },
        false,
        7,
      ),
    ).toEqual({
      content: "Create assignment Midterm Exam in CPSC 310.",
      explanation:
        "Review the proposed action below. Destructive or write actions require your approval before anything is sent to Canvas.",
      interpretedAction: {
        action: "Create Assignment",
        course: "CPSC 310",
        affectedStudents: "Entire class",
        primaryLink: {
          label: "Review preview",
          href: "/instructor/actions/preview?conversation=7&pending=42",
        },
      },
      pendingMessageId: 42,
    });
  });

  // Verifies: Maps cancelled replies.
  it("maps cancelled replies", () => {
    expect(
      mapChatReply(
        {
          action: "cancelled",
          cancelled: true,
          message: "Cancelled — no changes were made.",
        },
        false,
      ),
    ).toEqual({
      content: "Cancelled — no changes were made.",
    });
  });

  // Verifies: Maps respond replies.
  it("maps respond replies", () => {
    expect(
      mapChatReply(
        { action: "respond", message: "I can help with course management." },
        false,
      ),
    ).toEqual({
      content: "I can help with course management.",
    });
  });

  // Verifies: Maps fetch_courses results.
  it("maps fetch_courses results", () => {
    expect(
      mapChatReply(
        {
          courses: [
            { name: "CPSC 310", course_code: "CPSC310" },
            { name: "CPSC 313", course_code: "CPSC313" },
          ],
        },
        false,
      ),
    ).toEqual({
      content: "- CPSC 310\n- CPSC 313",
    });
  });

  // Verifies: Maps fetch_assignments results as a bulleted list, not just a count.
  it("maps fetch_assignments results as a bulleted list, not just a count", () => {
    const dueDate = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2030-08-16T05:59:00.000Z"));

    expect(
      mapChatReply(
        {
          assignments: [
            {
              id: 1,
              name: "Homework 1",
              due_at: "2030-08-16T05:59:00.000Z",
              points_possible: 20,
              course_id: 1,
            },
            {
              id: 2,
              name: "Homework 2",
              due_at: null,
              points_possible: null,
              course_id: 1,
            },
          ],
        },
        false,
      ),
    ).toEqual({
      content: `- Homework 1 (${dueDate} · 20 pts)\n- Homework 2 (No due date)`,
    });
  });

  // Verifies: Maps an empty fetch_assignments result.
  it("maps an empty fetch_assignments result", () => {
    expect(mapChatReply({ assignments: [] }, false)).toEqual({
      content: "This course has no assignments yet.",
    });
  });

  // Verifies: Maps successful confirm results.
  it("maps successful confirm results", () => {
    expect(
      mapChatReply(
        {
          success: true,
          action: "create_assignment",
          data: { id: 12, name: "Midterm Exam" },
        },
        false,
      ),
    ).toEqual({
      content: "Successfully completed Create Assignment: Midterm Exam.",
    });
  });
});
