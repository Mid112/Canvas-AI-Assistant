// Test note: covers the map intent preview to dry run.test behavior so future changes can preserve the expected Canvas workflow contract.

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

  // Verifies: Maps a stored intent preview message into dry-run preview data.
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

  // Verifies: Uses the latest modify request, not the original one, when the preview row was overwritten in place.
  it("uses the latest modify request, not the original one, when the preview row was overwritten in place", () => {
    // update_message_content overwrites the preview's own row on a modify
    // round instead of inserting a new one, so the message that produced
    // the *current* preview content is logged after this row, not before.
    const modifiedMessages: ConversationMessage[] = [
      {
        id: 10,
        role: "user",
        content: "Create a midterm exam for CPSC 310",
        created_at: "2026-07-05T00:00:00.000Z",
      },
      {
        // Same id (42) as the original preview — overwritten in place, now
        // reflecting the modify round's content.
        id: 42,
        role: "assistant",
        content: JSON.stringify({
          action: "intent_preview",
          intent_preview: true,
          summary: "Create assignment Midterm Exam in CPSC 310, worth 20 points.",
          proposed_action: {
            action: "create_assignment",
            title: "Midterm Exam",
            points_possible: 20,
          },
          preview_metadata: {
            action: "create_assignment",
            course: "CPSC 310",
          },
        }),
        created_at: "2026-07-05T00:01:00.000Z",
      },
      {
        id: 43,
        role: "user",
        content: "Create a midterm exam for CPSC 310 worth 20 points",
        created_at: "2026-07-05T00:02:00.000Z",
      },
    ];

    expect(
      mapIntentPreviewToDryRun(7, 42, modifiedMessages, "Dr. Jane Doe"),
    ).toMatchObject({
      originalRequest: "Create a midterm exam for CPSC 310 worth 20 points",
    });
  });

  // Verifies: Stops at a confirm/cancel marker instead of reading into a later, unrelated exchange.
  it("stops at a confirm/cancel marker instead of reading into a later, unrelated exchange", () => {
    const resolvedThenNewMessages: ConversationMessage[] = [
      ...messages,
      { id: 43, role: "user", content: "[confirmed action]", created_at: "2026-07-05T00:02:00.000Z" },
      { id: 44, role: "assistant", content: "{}", created_at: "2026-07-05T00:02:01.000Z" },
      { id: 45, role: "user", content: "Now send a message to the class", created_at: "2026-07-05T00:03:00.000Z" },
    ];

    expect(
      mapIntentPreviewToDryRun(7, 42, resolvedThenNewMessages, "Dr. Jane Doe"),
    ).toMatchObject({
      originalRequest: "Create a midterm exam for CPSC 310",
    });
  });

  // Verifies: Computes a field-level diff against the immediately preceding revision.
  it("computes a field-level diff against the immediately preceding revision", () => {
    const messagesWithSnapshot: ConversationMessage[] = [
      messages[0],
      {
        id: 42,
        role: "assistant",
        content: JSON.stringify({
          action: "intent_preview",
          intent_preview: true,
          summary: "Create assignment Midterm Exam in CPSC 310, worth 20 points.",
          proposed_action: {
            action: "create_assignment",
            local_course_id: 1,
            title: "Midterm Exam",
            description: "Covers chapters 1-4",
            points_possible: 20,
          },
          previous_proposed_action: {
            action: "create_assignment",
            local_course_id: 1,
            title: "Midterm Exam",
          },
          preview_metadata: { action: "create_assignment", course: "CPSC 310" },
        }),
        created_at: "2026-07-05T00:01:00.000Z",
      },
    ];

    const result = mapIntentPreviewToDryRun(7, 42, messagesWithSnapshot, "Dr. Jane Doe");

    expect(result.changesFromPreviousRequest).toEqual([
      { field: "description", label: "Description", type: "added", to: "Covers chapters 1-4" },
      { field: "points_possible", label: "Points Possible", type: "added", to: "20" },
    ]);
  });

  // Verifies: Returns no diff when there is no previous revision to compare against.
  it("returns no diff when there is no previous revision to compare against", () => {
    const result = mapIntentPreviewToDryRun(7, 42, messages, "Dr. Jane Doe");
    expect(result.changesFromPreviousRequest).toEqual([]);
  });

  // Verifies: Walks back through a clarify chain instead of showing the last short answer as the request.
  it("walks back through a clarify chain instead of showing the last short answer as the request", () => {
    // Mirrors a real conversation: an initial request, an unrelated error
    // (not a clarify), a fresh request, two rounds of clarify + short
    // answer, then the resulting preview.
    const clarifyChainMessages: ConversationMessage[] = [
      {
        id: 1,
        role: "user",
        content: 'create an assignment called "new test version 1" due on september 1st',
        created_at: "2026-07-08T00:00:00.000Z",
      },
      {
        id: 2,
        role: "assistant",
        content: "HTTPException 422: Due date must be in the future.",
        created_at: "2026-07-08T00:00:01.000Z",
      },
      {
        id: 3,
        role: "user",
        content: 'create an assignment called "new test version 1" due on October 1st',
        created_at: "2026-07-08T00:01:00.000Z",
      },
      {
        id: 4,
        role: "assistant",
        content: JSON.stringify({
          action: "clarify",
          clarify: true,
          question: "What is the description for the new assignment?",
        }),
        created_at: "2026-07-08T00:01:01.000Z",
      },
      { id: 5, role: "user", content: '"test 2"', created_at: "2026-07-08T00:02:00.000Z" },
      {
        id: 6,
        role: "assistant",
        content: JSON.stringify({
          action: "clarify",
          clarify: true,
          question: "How many points is the assignment worth?",
        }),
        created_at: "2026-07-08T00:02:01.000Z",
      },
      { id: 7, role: "user", content: "55", created_at: "2026-07-08T00:03:00.000Z" },
      {
        id: 8,
        role: "assistant",
        content: JSON.stringify({
          action: "intent_preview",
          intent_preview: true,
          summary: "Create assignment 'new test version 1', worth 55 points.",
          proposed_action: {
            action: "create_assignment",
            local_course_id: 1,
            title: "new test version 1",
            description: "test 2",
            due_date: "2026-10-01",
            points_possible: 55,
          },
          preview_metadata: { action: "create_assignment", course: "cosc 501" },
        }),
        created_at: "2026-07-08T00:03:01.000Z",
      },
    ];

    const result = mapIntentPreviewToDryRun(7, 8, clarifyChainMessages, "Dr. Jane Doe");

    expect(result.originalRequest).toBe(
      'create an assignment called "new test version 1" due on October 1st',
    );
  });

  // Verifies: Builds a structured plan from proposed_action, ordering known fields first.
  it("builds a structured plan from proposed_action, ordering known fields first", () => {
    const planMessages: ConversationMessage[] = [
      messages[0],
      {
        id: 42,
        role: "assistant",
        content: JSON.stringify({
          action: "intent_preview",
          intent_preview: true,
          summary: "Create assignment Midterm Exam in CPSC 310.",
          proposed_action: {
            action: "create_assignment",
            local_course_id: 1,
            points_possible: 20,
            due_date: "2026-08-01",
            title: "Midterm Exam",
            description: "Covers chapters 1-4",
          },
          preview_metadata: { action: "create_assignment", course: "CPSC 310" },
        }),
        created_at: "2026-07-05T00:01:00.000Z",
      },
    ];

    const result = mapIntentPreviewToDryRun(7, 42, planMessages, "Dr. Jane Doe");

    // "action" and "local_course_id" are internal, not shown to the user.
    // Known fields (title, description, due_date, points_possible) come
    // first, in that order, regardless of the object's own key order.
    expect(result.proposedPlan).toMatchObject([
      { field: "title", label: "Title", value: "Midterm Exam" },
      { field: "description", label: "Description", value: "Covers chapters 1-4" },
      { field: "due_date", label: "Due Date", value: "2026-08-01" },
      { field: "points_possible", label: "Points Possible", value: "20" },
    ]);
  });

  it("hides resolved internal ids from plans and diffs", () => {
    const internalMessages: ConversationMessage[] = [
      messages[0],
      {
        id: 42,
        role: "assistant",
        content: JSON.stringify({
          intent_preview: true,
          summary: "Update grade.",
          proposed_action: {
            action: "update_grade",
            local_course_id: 1,
            assignment_id: 42,
            student_id: 99,
            new_grade: "85",
            feedback: "Good improvement",
          },
          previous_proposed_action: {
            action: "update_grade",
            local_course_id: 1,
            assignment_id: 41,
            student_id: 98,
            new_grade: "80",
          },
          preview_metadata: { action: "update_grade", course: "CPSC 310" },
        }),
        created_at: "2026-07-05T00:01:00.000Z",
      },
    ];

    const result = mapIntentPreviewToDryRun(
      7,
      42,
      internalMessages,
      "Dr. Jane Doe",
    );

    expect(result.proposedPlan?.map((field) => field.field)).toEqual([
      "new_grade",
      "feedback",
    ]);
    expect(
      result.changesFromPreviousRequest?.map((change) => change.field),
    ).not.toContain("student_id");
  });

  // Verifies: Renders a missing field as an em dash placeholder in the structured plan.
  it("renders a missing field as an em dash placeholder in the structured plan", () => {
    const planMessages: ConversationMessage[] = [
      messages[0],
      {
        id: 42,
        role: "assistant",
        content: JSON.stringify({
          action: "intent_preview",
          intent_preview: true,
          summary: "Create assignment Midterm Exam.",
          proposed_action: {
            action: "create_assignment",
            local_course_id: 1,
            title: "Midterm Exam",
            description: "",
            due_date: "2026-08-01",
            points_possible: null,
          },
          preview_metadata: { action: "create_assignment", course: "CPSC 310" },
        }),
        created_at: "2026-07-05T00:01:00.000Z",
      },
    ];

    const result = mapIntentPreviewToDryRun(7, 42, planMessages, "Dr. Jane Doe");
    const description = result.proposedPlan?.find((field) => field.field === "description");
    const points = result.proposedPlan?.find((field) => field.field === "points_possible");

    expect(description?.value).toBe("—");
    expect(points?.value).toBe("—");
  });
});
