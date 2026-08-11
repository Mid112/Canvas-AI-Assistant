import { describe, expect, it } from "vitest";

import {
  buildAssignmentGenerationPrompt,
  ChatReplyMappingError,
  mapChatReply,
  mapChatReplyToAssistantResponse,
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
        'I have the title "Midterm". Which assignment should I update?',
      acknowledgedFields: [{ label: "Assignment title", value: "Midterm" }],
    });
  });

  it("uses readable assignment labels in clarification acknowledgements", () => {
    expect(
      mapChatReply(
        {
          action: "clarify",
          question: "What description should I use?",
          partial_plan: {
            course_name: "Capstone Project",
            title: "Research Proposal",
            due_date: "April 15",
            points_possible: 50,
          },
        },
        false,
      ),
    ).toMatchObject({
      content:
        'I have the Capstone Project course, the title "Research Proposal", the due date April 15, and 50 possible points. What description should I use?',
      acknowledgedFields: [
        { label: "Course", value: "Capstone Project" },
        { label: "Assignment title", value: "Research Proposal" },
        { label: "Due date", value: "April 15" },
        { label: "Possible points", value: "50" },
      ],
    });
  });

  it("formats a raw missing-assignment-field list", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question: "title, description, due_date",
        partial_plan: {},
      },
      false,
    );

    expect(result.content).toBe(
      "I still need the assignment title, description, and due date.",
    );
  });

  it("formats raw missing grade fields using the shared field labels", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question: "assignment_reference, student_reference, new_grade",
        partial_plan: { course_name: "Capstone Project" },
      },
      false,
    );

    expect(result.content).toBe(
      "I have the Capstone Project course. I still need the assignment, student, and proposed grade.",
    );
  });

  it("replaces schema tokens without rewriting natural prose", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question:
          "Which assignment would you like to update, and what changes would you like to make (title, description, due_date, points_possible)?",
        partial_plan: { course_name: "Capstone Project" },
      },
      false,
    );

    expect(result.content).toBe(
      "I have the Capstone Project course. Which assignment would you like to update, and what changes would you like to make (title, description, due date, possible points)?",
    );
  });

  it("does not rewrite ordinary words that match field names", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question: "Please provide a title for the quiz.",
        partial_plan: {},
      },
      false,
    );

    expect(result.content).toBe("Please provide a title for the quiz.");
  });

  // `reason` is deliberately absent from the plan below: it is deprecated and
  // normalized to `feedback` server-side, so a reply can no longer carry both.
  it("does not acknowledge failed resolver references", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question: "Which student did you mean?",
        unresolved_fields: ["student_reference"],
        partial_plan: {
          student_reference: "coin",
          feedback: "Good work",
        },
      },
      false,
    );

    expect(result.content).toBe("I have the feedback provided. Which student did you mean?");
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
            feedback: "Bonus adjustment",
          },
        },
        false,
      ),
    ).toEqual({
      acknowledgedFields: [
        { label: "Course", value: "COSC 777" },
        { label: "Assignment", value: "leetcode" },
        { label: "Proposed grade", value: "110" },
        { label: "Feedback", value: "Bonus adjustment" },
      ],
      content:
        'I have the COSC 777 course, the assignment "leetcode", a proposed grade of 110, and the feedback provided. Which assignment should I update?',
      interpretedAction: {
        action: "Update Grade",
        course: "COSC 777",
        affectedStudents: "Course-wide",
        primaryLink: {
          label: "Open Grades tab",
          href: "/instructor/courses/7/grades?grade=110&feedback=Bonus+adjustment",
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
            feedback: "Please improve the explanation.",
          },
        },
        false,
      ),
    ).toEqual({
      acknowledgedFields: [
        { label: "Student", value: "Coin" },
        { label: "Feedback", value: "Please improve the explanation." },
      ],
      content:
        'I have the student "Coin" and the feedback provided. Do you want to add assignment feedback on a submission, or send a private message to the student?',
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
            risk_metadata: {
              risk_level: "medium",
              classification: "modifying",
              requires_confirmation: true,
              confirmation_requirement: {
                type: "standard",
                label: "Standard confirmation",
                description: "Review the preview, then confirm to apply the change.",
              },
              destructive: false,
              reversible: true,
              undoable: true,
              can_undo: true,
              reversibility: "This action can be undone from workflow history.",
              warnings: [],
              technical_details: { action: "create_assignment" },
            },
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
        risk: {
          risk_level: "medium",
          classification: "modifying",
          requires_confirmation: true,
          confirmation_requirement: {
            type: "standard",
            label: "Standard confirmation",
            description: "Review the preview, then confirm to apply the change.",
          },
          destructive: false,
          reversible: true,
          undoable: true,
          can_undo: true,
          reversibility: "This action can be undone from workflow history.",
          warnings: [],
          technical_details: { action: "create_assignment" },
        },
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
            feedback: "Bonus adjustment",
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
          href: "/instructor/courses/7/grades?assignmentId=10&studentIds=42%2C43&grade=110&feedback=Bonus+adjustment",
        },
      },
    });
  });

  it("maps feedback text into the Grades tab feedback prefill", () => {
    const result = mapChatReply(
      {
        action: "respond",
        message: "Open the Grades tab to review and approve.",
        grade_handoff: {
          local_course_id: 7,
          course_name: "COSC 777",
          assignment_id: 10,
          student_ids: [42],
          student_count: 1,
          new_grade: "85",
          feedback: "Strong work on the explanation.",
        },
      },
      false,
    );

    expect(result.interpretedAction?.primaryLink?.href).toBe(
      "/instructor/courses/7/grades?assignmentId=10&studentIds=42&grade=85&feedback=Strong+work+on+the+explanation.",
    );
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

  it("keeps create_quiz in chat and provides an explicit form handoff", () => {
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
    expect(result.autoNavigate).toBe(false);
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

  it("hands a single send_message to Messages on a button, not a redirect", () => {
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
    // Being redirected mid-conversation ends the thread: no way back to keep
    // refining the draft with the assistant, or to ask it anything else. The
    // instructor goes when they click, the way create_quiz already works.
    expect(result.autoNavigate).toBe(false);
    // navigateTo stays: assistant.ts reads it to recognise a form handoff and
    // suppress chat's own "Approve this proposed action?" confirm, so without
    // it the same send would be reviewable in two places at once. It is the
    // button's destination now rather than an automatic jump.
    expect(result.navigateTo?.path).toBe("/instructor/messages?tab=compose");
    expect(result.navigateTo?.state).toMatchObject({
      returnTo: "/instructor/assistant",
      aiMessageDraft: {
        subject: "Deadline Reminder",
        body: "Please submit by Friday.",
        courseId: 5,
        recipientIds: ["11", "22"],
        deliveryMode: "private_message",
        conversationId: 3,
      },
    });
    // Kept for replayed history, where nothing navigates: the button is then
    // the only route back to the draft.
    expect(result.interpretedAction?.primaryLink?.label).toBe(
      "Open message draft",
    );
    expect(result.interpretedAction?.primaryLink?.href).toBe(
      "/instructor/messages?tab=compose",
    );
    expect(result.interpretedAction?.primaryLink?.state).toMatchObject({
      returnTo: "/instructor/assistant",
      aiMessageDraft: {
        subject: "Deadline Reminder",
        body: "Please submit by Friday.",
        courseId: 5,
        recipientIds: ["11", "22"],
        conversationId: 3,
      },
    });
    expect(result.interpretedAction?.secondaryLink).toBeUndefined();
  });

  // Verifies: a turn that resolved to several distinct messages stays in chat.
  // Navigating could only ever open one of the drafts, and the others would be
  // left with nothing pointing at them -- so grouped turns keep every row and
  // its own "Open message draft" button instead.
  //
  // The extras were being dropped outright before this: additional_previews
  // was read below the send_message branch, and that branch returns early, so
  // the only action that produces them never reached the code that read them.
  // Reported from a real turn: the clarify read back
  //   'I have the broadcast to all students "false" and the also announce to
  //    class "false". What should the message subject be?'
  // Neither flag was provided by anyone -- the model sets them for its own
  // routing -- and a false flag is the absence of a choice, not information.
  it("does not read delivery routing flags back as provided details", () => {
    const result = mapChatReply(
      {
        action: "clarify",
        question: "What should the message subject be?",
        partial_plan: {
          broadcast_to_all_students: false,
          also_announce_to_class: false,
          delivery_mode: "private_message",
          student_reference: "student two",
        },
      },
      false,
    );

    expect(result.content).toBe(
      'I have the student "student two". What should the message subject be?',
    );
    expect(result.acknowledgedFields).toEqual([
      { label: "Student", value: "student two" },
    ]);
  });

  // Same turn, second defect: every label was substituted into the question
  // text, so "subject" inside "What should the message subject be?" became
  // "message subject" and produced "the message message subject".
  it("does not double a label already spelled out in the question", () => {
    const result = mapChatReply(
      { action: "clarify", question: "What should the message subject be?", partial_plan: {} },
      false,
    );

    expect(result.content).toBe("What should the message subject be?");
  });

  it("keeps every draft in chat when send_message resolved to several messages", () => {
    const group = (subject: string, recipientId: number) => ({
      intent_preview: true,
      summary: `Send ${subject}.`,
      proposed_action: {
        action: "send_message",
        local_course_id: 5,
        subject,
        body: "Please submit by Friday.",
        recipient_canvas_user_ids: [recipientId],
      },
      preview_metadata: { course: "CPSC 310" },
    });

    const result = mapChatReply(
      {
        ...group("Deadline Reminder", 11),
        additional_previews: [group("Late Penalty Notice", 22)],
      },
      false,
      3,
    );

    expect(result.navigateTo).toBeUndefined();
    expect(result.additionalPreviews).toHaveLength(1);
    expect(result.additionalPreviews?.[0]?.interpretedAction?.primaryLink?.state)
      .toMatchObject({
        aiMessageDraft: { subject: "Late Penalty Notice", recipientIds: ["22"] },
      });
  });

  // An action plan produces extra cards for any reply shape, not just an
  // intent_preview. "Message them, then bump the grades" ends on a grade
  // handoff, which is a plain respond -- and additional_previews used to be
  // read only inside the intent_preview branch, so every card after the first
  // was persisted by the backend, returned over the wire, and then silently
  // dropped here.
  it("keeps extra cards when the first result is not an intent_preview", () => {
    const result = mapChatReply(
      {
        action: "respond",
        message: "Adding 1 to 2 already-graded students in CPSC 310.",
        grade_handoff: {
          local_course_id: 5,
          course_name: "CPSC 310",
          assignment_id: 222,
          student_ids: [11, 22],
          student_count: 2,
          new_grade: "+1",
          grade_delta: 1,
          student_grades: [
            { user_id: 11, new_grade: "41" },
            { user_id: 22, new_grade: "91" },
          ],
          feedback: "Nice work.",
        },
        additional_previews: [
          {
            intent_preview: true,
            summary: "Send Marks Updated.",
            proposed_action: {
              action: "send_message",
              local_course_id: 5,
              subject: "Marks Updated",
              body: "Your mark went up by 1.",
              recipient_canvas_user_ids: [11, 22],
            },
            preview_metadata: { course: "CPSC 310" },
          },
        ],
      },
      false,
      3,
    );

    expect(result.interpretedAction?.action).toBe("Update Grade");
    expect(result.additionalPreviews).toHaveLength(1);
    expect(result.additionalPreviews?.[0]?.interpretedAction?.action)
      .toBe("Send Message");
  });

  it("carries per-student targets into the Grades tab link, not a single grade", () => {
    // "+1" must never be prefilled as everyone's grade -- it would set the
    // whole class to 1. The per-student targets go instead, and the grade
    // param stays absent.
    const result = mapChatReply(
      {
        action: "respond",
        message: "Adding 1 to 2 already-graded students in CPSC 310.",
        grade_handoff: {
          local_course_id: 5,
          course_name: "CPSC 310",
          assignment_id: 222,
          student_ids: [11, 22],
          student_count: 2,
          new_grade: "+1",
          grade_delta: 1,
          student_grades: [
            { user_id: 11, new_grade: "41" },
            { user_id: 22, new_grade: "91" },
          ],
          feedback: "Nice work.",
        },
      },
      false,
    );

    const href = result.interpretedAction?.primaryLink?.href ?? "";
    expect(href).toContain("studentGrades=11%3A41%2C22%3A91");
    expect(href).not.toMatch(/[?&]grade=/);
    expect(href).toContain("feedback=Nice+work.");
  });

  // The assistant re-resolves the course from the message, so a preview can be
  // for a course other than the selected one — "create an assignment ... for
  // Capstone Project" while COSTCO is active. Surfacing the resolved id is
  // what lets the assistant page move the chat tab to match, instead of
  // leaving a Capstone Project preview sitting in the COSTCO tab.
  it("reports the course a preview actually resolved to", () => {
    const result = mapChatReply(
      {
        intent_preview: true,
        summary: "Create 'Final project delivery' in Capstone Project.",
        proposed_action: {
          action: "create_assignment",
          local_course_id: 12,
          title: "Final project delivery",
        },
        preview_metadata: { course_name: "Capstone Project" },
        pending_message_id: 5,
      },
      false,
      3,
    );

    expect(result.resolvedCourse).toEqual({
      localCourseId: 12,
      courseName: "Capstone Project",
    });
  });

  it("reports no course when the reply names none", () => {
    const result = mapChatReply(
      { action: "respond", message: "Hello." },
      false,
      3,
    );

    expect(result.resolvedCourse).toBeUndefined();
  });

  it("provides an explicit feedback-form link for update_grade", () => {
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

  // Verifies: Regression (#12, #13) — unverified_claims rides through to the
  // UI so the reply can carry a warning instead of being rewritten.
  it("carries unverified_claims through to the mapped response", () => {
    const result = mapChatReplyToAssistantResponse(
      {
        action: "respond",
        message: "Average overall grade 82 %.",
        unverified_claims: ["grade"],
      },
      false,
    );

    expect(result.content).toBe("Average overall grade 82 %.");
    expect(result.unverifiedClaims).toEqual(["grade"]);
  });

  it("leaves unverifiedClaims unset when the backend flagged nothing", () => {
    const result = mapChatReplyToAssistantResponse(
      { action: "respond", message: "Hello!" },
      false,
    );

    expect(result.unverifiedClaims).toBeUndefined();
  });

  // Verifies: Regression (#15) — the create_assignment handoff carries the
  // prompt that seeds the describe-step generator, so a chat-initiated
  // assignment reaches Review with a written-out description.
  it("carries a generation prompt on the create_assignment handoff", () => {
    const result = mapChatReplyToAssistantResponse(
      {
        action: "intent_preview",
        intent_preview: true,
        summary: "Create a new assignment titled \"Homework 3\" in COSTCO.",
        proposed_action: {
          action: "create_assignment",
          local_course_id: 42,
          title: "Homework 3",
          description: "it is about beef corndogs",
          points_possible: 120,
        },
        preview_metadata: { course: "COSTCO" },
        pending_message_id: 9,
      },
      false,
      3,
    );

    const state = result.interpretedAction?.secondaryLink?.state as
      | { aiAssignmentDraft?: { prompt?: string } }
      | undefined;
    expect(state?.aiAssignmentDraft?.prompt).toBe(
      "Homework 3. it is about beef corndogs",
    );
  });

  // Verifies: #1512 — create_quiz handoff prefers generation_prompt (full
  // utterance) so title≠topic cases seed describe with the body topic.
  it("carries the full generation_prompt on the create_quiz handoff", () => {
    const utterance =
      "Create a quiz called 'recursion principles' with 5 multiple-choice questions about cell biology. Each question should have 4 options. Set it to 50 points total, with a 30-minute time limit.";
    const result = mapChatReplyToAssistantResponse(
      {
        intent_preview: true,
        summary: "Create recursion principles",
        proposed_action: {
          action: "create_quiz",
          local_course_id: 5,
          title: "recursion principles",
          description: "",
          points_possible: 50,
          time_limit: 30,
          generation_prompt: utterance,
        },
        preview_metadata: { course: "CPSC 310" },
      },
      false,
      3,
    );

    expect(result.navigateTo?.state).toMatchObject({
      aiQuizDraft: {
        name: "recursion principles",
        pointsPossible: 50,
        timeLimit: 30,
        prompt: utterance,
      },
    });
    expect(
      (result.navigateTo?.state as { aiQuizDraft?: { prompt?: string } })
        ?.aiQuizDraft?.prompt,
    ).toContain("cell biology");
    expect(
      (result.navigateTo?.state as { aiQuizDraft?: { prompt?: string } })
        ?.aiQuizDraft?.prompt,
    ).not.toMatch(/^Title:\s*recursion principles$/);
  });

  // Verifies: older create_quiz messages without generation_prompt still get
  // a title+description join (assignment-style) rather than no prompt.
  it("falls back to title and description when generation_prompt is missing", () => {
    const result = mapChatReplyToAssistantResponse(
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
        preview_metadata: { course: "CPSC 310" },
      },
      false,
      3,
    );

    expect(result.navigateTo?.state).toMatchObject({
      aiQuizDraft: {
        name: "Recursion Quiz",
        prompt:
          "Recursion Quiz. Covers base cases and recursive definitions.",
      },
    });
  });

  it("maps structured missing-submission analytics into a scannable list", () => {
    const result = mapChatReply(
      {
        action: "respond",
        message: "Here is the missing list for Assignment 4.",
        structured_analytics: {
          action: "resolve_missing_submissions",
          status: "missing",
          count: 2,
          sample: ["Alice", "Bob"],
          local_course_id: 12,
          course_name: "CPSC 310",
          assignment_id: 222,
          assignment_name: "Assignment 4",
          due_at: "2026-06-01T00:00:00+00:00",
          summary:
            '2 active student(s) in CPSC 310 are missing "Assignment 4". Examples: Alice, Bob.',
        },
      },
      false,
    );

    expect(result.content).toContain("Assignment 4 · CPSC 310");
    expect(result.content).toContain("Due:");
    expect(result.content).toContain("2 students missing:");
    expect(result.content).toContain("- Alice");
    expect(result.content).toContain("- Bob");
    expect(result.explanation).toBe(
      "Here is the missing list for Assignment 4.",
    );
    expect(result.interpretedAction?.action).toBe("Missing submissions");
    expect(result.interpretedAction?.primaryLink).toEqual({
      label: "Open course analytics",
      href: "/instructor/courses/12/analytics?status=missing&assignmentId=222",
    });
  });

  it("maps empty missing analytics with a clear zero-state message", () => {
    const result = mapChatReply(
      {
        action: "resolve_missing_submissions",
        status: "missing",
        count: 0,
        sample: [],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Assignment 4",
        due_at: null,
        summary:
          'No active students are missing "Assignment 4" in CPSC 310.',
      },
      false,
    );

    expect(result.content).toContain(
      'No active students are missing "Assignment 4" in CPSC 310.',
    );
    expect(result.content).not.toContain("Due:");
    // Summary already lives in content — don't duplicate it in ExplanationCard.
    expect(result.explanation).toBeUndefined();
    expect(result.interpretedAction?.affectedStudents).toBe("0 students");
    expect(result.interpretedAction?.primaryLink?.href).toContain(
      "status=missing",
    );
  });

  // A combined missing+late request arrives as the single slug "missing_late".
  // Rendering it as plain "missing" would present a joint group as one
  // category — the same silent half-answer the backend union exists to stop.
  it("renders a missing+late union as a combined group, not as missing", () => {
    const result = mapChatReply(
      {
        action: "resolve_missing_submissions",
        status: "missing_late",
        statuses: ["missing", "late"],
        status_counts: { missing: 2, late: 1 },
        count: 3,
        sample: ["Alice", "Bob", "Cy"],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Assignment 4",
        due_at: null,
        summary: "3 active student(s) in CPSC 310 — 2 missing and 1 late.",
      },
      false,
    );

    expect(result.content).toContain("3 students missing or submitted late:");
    expect(result.content).toContain("2 missing and 1 late");
    expect(result.content).toContain("one combined group");
    expect(result.interpretedAction?.action).toBe("Missing or late submissions");
    // No single-category deep link exists for a union, so the analytics link
    // degrades to the unfiltered course view rather than picking a side.
    expect(result.interpretedAction?.primaryLink?.href).not.toContain("status=");
  });

  it("keeps a zero side visible in a union breakdown", () => {
    const result = mapChatReply(
      {
        action: "resolve_missing_submissions",
        status: "missing_late",
        statuses: ["missing", "late"],
        status_counts: { missing: 4, late: 0 },
        count: 4,
        sample: ["Alice"],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Assignment 4",
        due_at: null,
      },
      false,
    );

    expect(result.content).toContain("4 missing and 0 late");
  });

  it("renders a score range with the interpretation it used", () => {
    const result = mapChatReply(
      {
        action: "resolve_score_range",
        count: 2,
        sample: ["Alice", "Bob"],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Midterm",
        min_score: 70,
        max_score: 90,
        points_possible: 50,
        basis: "percentage",
        basis_reason: "range_exceeds_points_possible",
        basis_explanation:
          "Read as 70-90 percent — the assignment is out of 50 points, so 70-90 points isn't a possible score.",
        range_label: "70-90 percent",
      },
      false,
    );

    expect(result.content).toContain("2 students scored 70-90 percent");
    expect(result.content).toContain("- Alice");
    // The auto-picked basis has to reach the instructor, or a wrong pick is
    // uncorrectable before the follow-up message goes out.
    expect(result.content).toContain("out of 50 points");
  });

  it("states the interpretation even when the range matched nobody", () => {
    const result = mapChatReply(
      {
        action: "resolve_score_range",
        count: 0,
        sample: [],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Midterm",
        basis: "points",
        basis_reason: "no_points_possible",
        basis_explanation:
          "Read as 70-90 points — this assignment has no points value, so a percentage can't be computed.",
        range_label: "70-90 points",
      },
      false,
    );

    expect(result.content).toContain("No active students scored 70-90 points");
    // Without this, "nobody matched" is indistinguishable from having
    // silently banded against the wrong unit.
    expect(result.content).toContain("no points value");
  });

  it("does not attach a submission-status filter to a score-range link", () => {
    const result = mapChatReply(
      {
        action: "resolve_score_range",
        count: 3,
        sample: ["Alice"],
        local_course_id: 12,
        course_name: "CPSC 310",
        assignment_id: 222,
        assignment_name: "Midterm",
        basis: "points",
        range_label: "70-90 points",
      },
      false,
    );

    // A score band is orthogonal to submission status; a status filter here
    // would present a different group than the one that was resolved.
    expect(result.interpretedAction?.primaryLink?.href).not.toContain("status=");
    expect(result.interpretedAction?.primaryLink?.href).toContain(
      "assignmentId=222",
    );
  });

  it("omits the due line when due_at and due_date are null", () => {
    const result = mapChatReply(
      {
        action: "respond",
        message: "2 students are missing Assignment 4.",
        structured_analytics: {
          action: "resolve_missing_submissions",
          status: "missing",
          count: 2,
          sample: ["Alice", "Bob"],
          local_course_id: 12,
          course_name: "CPSC 310",
          assignment_id: 222,
          assignment_name: "Assignment 4",
          due_at: null,
          due_date: null,
          summary:
            '2 active student(s) in CPSC 310 are missing "Assignment 4". Examples: Alice, Bob.',
        },
      },
      false,
    );

    expect(result.content).toContain("Assignment 4 · CPSC 310");
    expect(result.content).not.toContain("Due:");
    expect(result.content).not.toContain("No due date");
  });

  it("maps unavailable submission-rate analytics clearly", () => {
    const result = mapChatReply(
      {
        action: "respond",
        message: "CPSC 310 has no assignments yet.",
        structured_analytics: {
          action: "find_assignment_by_submission_rate",
          matched: false,
          local_course_id: 12,
          course_name: "CPSC 310",
          assignment_id: null,
          assignment_name: null,
          due_at: null,
          submission_rate_percent: null,
          summary:
            "CPSC 310 has no assignments yet, so submission-rate analytics are unavailable.",
        },
      },
      false,
    );

    expect(result.content).toContain("Submission-rate analytics · CPSC 310");
    expect(result.content).toContain(
      "CPSC 310 has no assignments yet, so submission-rate analytics are unavailable.",
    );
    expect(result.content).not.toContain("Due:");
    expect(result.interpretedAction?.affectedStudents).toBe("No match");
    expect(result.interpretedAction?.primaryLink?.href).toBe(
      "/instructor/courses/12/analytics",
    );
  });
});

describe("buildAssignmentGenerationPrompt", () => {
  it("joins title and description into one describe-step prompt", () => {
    expect(
      buildAssignmentGenerationPrompt({
        title: "Homework 3",
        description: "it is about beef corndogs",
      }),
    ).toBe("Homework 3. it is about beef corndogs");
  });

  it("does not double up punctuation on a title that ends a sentence", () => {
    expect(
      buildAssignmentGenerationPrompt({
        title: "What is recursion?",
        description: "Cover base cases.",
      }),
    ).toBe("What is recursion? Cover base cases.");
  });

  it("falls back to whichever field is present", () => {
    expect(buildAssignmentGenerationPrompt({ title: "Homework 3" })).toBe(
      "Homework 3",
    );
    expect(
      buildAssignmentGenerationPrompt({ description: "beef corndogs" }),
    ).toBe("beef corndogs");
  });

  // Verifies: an empty proposal yields no prompt, so the create page keeps
  // its existing behaviour instead of calling the generator with "".
  it("returns undefined when there is nothing to generate from", () => {
    expect(buildAssignmentGenerationPrompt({})).toBeUndefined();
    expect(
      buildAssignmentGenerationPrompt({ title: "   ", description: "  " }),
    ).toBeUndefined();
  });
});
