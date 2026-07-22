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
          partial_plan: {
            title: "Midterm",
            local_course_id: 123,
            assignment_id: 456,
          },
        },
        false,
      ),
    ).toEqual({
      content:
        "I have title: Midterm. Which assignment should I update?",
      acknowledgedFields: [{ label: "Title", value: "Midterm" }],
    });
  });

  it("maps grade clarify partial plans to the Grades tab when grade scoped", () => {
    expect(
      mapChatReply(
        {
          action: "clarify",
          clarify: true,
          question: "Which assignment should I update?",
          partial_plan: {
            action: "update_grade",
            local_course_id: 7,
            course_name: "COSC 777",
            assignment_reference: "leetcode",
            new_grade: "110",
            reason: "Bonus adjustment",
          },
        },
        false,
      ),
    ).toEqual({
      acknowledgedFields: [
        { label: "Course Name", value: "COSC 777" },
        { label: "Assignment Reference", value: "leetcode" },
        { label: "New Grade", value: "110" },
        { label: "Reason", value: "Bonus adjustment" },
      ],
      content:
        "I have course name: COSC 777, assignment reference: leetcode, new grade: 110, reason: Bonus adjustment. Which assignment should I update?",
      interpretedAction: {
        action: "Update Grade",
        course: "COSC 777",
        affectedStudents: "Course-wide",
        primaryLink: {
          label: "Open Grades tab",
          href: "/instructor/courses/7/grades?grade=110&reason=Bonus+adjustment",
        },
      },
    });
  });

  it("does not map ambiguous feedback clarify replies to the Grades tab", () => {
    expect(
      mapChatReply(
        {
          action: "clarify",
          clarify: true,
          question:
            "Do you want to add assignment feedback on a submission, or send a private message to the student?",
          partial_plan: {
            action: "update_grade",
            local_course_id: 7,
            student_reference: "Coin",
            reason: "Please improve the explanation.",
          },
        },
        false,
      ),
    ).toEqual({
      acknowledgedFields: [
        { label: "Student Reference", value: "Coin" },
        { label: "Reason", value: "Please improve the explanation." },
      ],
      content:
        "I have student reference: Coin, reason: Please improve the explanation. Do you want to add assignment feedback on a submission, or send a private message to the student?",
    });
  });

  // Verifies: Maps intent_preview replies.
  it("maps intent_preview replies", () => {
    const result = mapChatReply(
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
      );
    expect(result).toMatchObject({
      content: "Create assignment Midterm Exam in CPSC 310.",
      explanation:
        "Review the proposed action below. Destructive or write actions require your approval before anything is sent to Canvas.",
      interpretedAction: {
        action: "Create Assignment",
        course: "CPSC 310",
        affectedStudents: "Entire class",
        technicalDetails: [
          { label: "Action type", value: "Create Assignment" },
        ],
        primaryLink: {
          label: "Review preview",
          href: "/instructor/actions/preview?conversation=7&pending=42",
        },
      },
      pendingMessageId: 42,
    });
    expect(result.interpretedAction?.secondaryLink?.label).toBe(
      "Edit assignment details",
    );
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

  it("maps grade handoff replies to the Grades tab prefill action", () => {
    // The backend sends a normal respond envelope; the mapper is responsible
    // for turning the grade_handoff payload into the existing action-card link.
    expect(
      mapChatReply(
        {
          action: "respond",
          message: "Open the Grades tab to review and approve.",
          grade_handoff: {
            local_course_id: 7,
            course_name: "COSC 777",
            assignment_id: 10,
            student_ids: [42, 43],
            student_count: 2,
            new_grade: "110",
            reason: "Bonus adjustment",
          },
        },
        false,
      ),
    ).toEqual({
      content: "Open the Grades tab to review and approve.",
      interpretedAction: {
        action: "Update Grade",
        course: "COSC 777",
        affectedStudents: "2 students",
        primaryLink: {
          label: "Open Grades tab",
          href: "/instructor/courses/7/grades?assignmentId=10&studentIds=42%2C43&grade=110&reason=Bonus+adjustment",
        },
      },
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

  it("never exposes raw payload JSON in fallback responses", () => {
    const result = mapChatReply(
      {
        data: {
          local_course_id: 123,
          student_id: 456,
          secret_internal_value: "hidden",
        },
      },
      false,
    );

    expect(result.content).toBe("The action completed successfully.");
    expect(result.explanation).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("secret_internal_value");
  });

  it("auto-redirects create_quiz and keeps a form button for chat history", () => {
    const result = mapChatReply(
      {
        intent_preview: true,
        summary: "Create Recursion Quiz.",
        proposed_action: {
          action: "create_quiz",
          local_course_id: 5,
          title: "Recursion Quiz",
          description: "Covers base cases and recursive definitions.",
          due_date: "2030-08-01T12:00:00Z",
          points_possible: 20,
          questions: [],
        },
        preview_metadata: {
          course: "CPSC 310",
          risk_level: "medium",
          reversible: true,
        },
        pending_message_id: 9,
      },
      false,
      3,
    );

    expect(result.pendingMessageId).toBeUndefined();
    expect(result.navigateTo?.path).toBe("/instructor/quizzes/create");
    expect(result.navigateTo?.state).toMatchObject({
      returnTo: "/instructor/assistant",
      aiQuizDraft: {
        courseId: 5,
        name: "Recursion Quiz",
        conversationId: 3,
      },
    });
    expect(result.interpretedAction?.primaryLink?.label).toBe(
      "Open quiz creation form",
    );
    expect(result.interpretedAction?.primaryLink?.href).toBe(
      "/instructor/quizzes/create",
    );
    expect(result.interpretedAction?.primaryLink?.state).toMatchObject({
      aiQuizDraft: {
        courseId: 5,
        name: "Recursion Quiz",
        conversationId: 3,
      },
    });
  });

  it("auto-redirects send_message to the Messages compose tab", () => {
    const result = mapChatReply(
      {
        intent_preview: true,
        summary: "Send deadline reminder to 2 students.",
        proposed_action: {
          action: "send_message",
          local_course_id: 5,
          subject: "Deadline Reminder",
          body: "Please submit by Friday.",
          recipient_canvas_user_ids: [11, 22],
        },
        preview_metadata: {
          course: "CPSC 310",
          summary: "Deadline reminder",
          risk_level: "high",
          reversible: false,
        },
        pending_message_id: 12,
      },
      false,
      3,
    );

    expect(result.pendingMessageId).toBeUndefined();
    expect(result.navigateTo?.path).toBe("/instructor/messages?tab=compose");
    expect(result.navigateTo?.state).toMatchObject({
      returnTo: "/instructor/assistant",
      aiMessageDraft: {
        subject: "Deadline Reminder",
        body: "Please submit by Friday.",
        courseId: 5,
        recipientIds: ["11", "22"],
        conversationId: 3,
      },
    });
    expect(result.interpretedAction?.primaryLink?.label).toBe(
      "Open message draft",
    );
    expect(result.interpretedAction?.secondaryLink).toBeUndefined();
  });

  it("auto-redirects update_grade to the feedback form", () => {
    const result = mapChatReply(
      {
        intent_preview: true,
        summary: "Update grade for Alex Chen on Recursion Homework.",
        proposed_action: {
          action: "update_grade",
          local_course_id: 5,
          assignment_id: 44,
          student_id: 77,
          assignment_reference: "Recursion Homework",
          student_reference: "Alex Chen",
          new_grade: "85",
          feedback: "Strong work on the base case explanation.",
        },
        preview_metadata: {
          course: "CPSC 310",
          risk_level: "medium",
          reversible: true,
        },
        pending_message_id: 11,
      },
      false,
      3,
    );

    expect(result.pendingMessageId).toBeUndefined();
    expect(result.navigateTo?.path).toBe("/instructor/feedback/create");
    expect(result.navigateTo?.state).toMatchObject({
      returnTo: "/instructor/assistant",
      aiFeedbackDraft: {
        courseId: 5,
        assignmentId: 44,
        studentId: 77,
        assignmentName: "Recursion Homework",
        studentName: "Alex Chen",
        newGrade: "85",
        feedback: "Strong work on the base case explanation.",
        conversationId: 3,
      },
    });
    expect(result.interpretedAction).toBeUndefined();
  });
});
