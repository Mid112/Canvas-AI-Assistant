import { instructorMessagesPath, paths } from "@/routes/paths";

/**
 * The quick actions the dashboard and the AI Assistant both offer.
 *
 * The two surfaces used to keep separate tables — the dashboard routed
 * "create-assignment" into the assignment creator while the assistant's
 * own button under the same label only started a chat turn, and the
 * analytics action was "course-analytics" on one side and
 * "analyse-missing-submissions" on the other. Sharing the ids and resolving
 * behaviour here is what stops the same label doing two different things
 * depending on where the instructor clicked it.
 */
export type QuickActionId =
  | "create-assignment"
  | "create-quiz"
  | "create-feedback"
  | "draft-announcement"
  | "draft-student-message"
  | "analyse-missing-submissions";

/**
 * Either open a creator page, or run an assistant turn with a set prompt.
 *
 * Callers own how they reach the assistant, because that differs by
 * surface: the dashboard navigates to it carrying the prompt in route
 * state, while the assistant is already on the page and just sends.
 */
export type QuickActionBehaviour =
  | { kind: "navigate"; path: string; state?: Record<string, unknown> }
  | { kind: "prompt"; prompt: string };

/** Actions with a purpose-built page go straight there — the dedicated form
 * is a better tool for the job than a chat turn.
 *
 * Announcements and student messages are separate entries on purpose. They
 * were briefly one, and the surfaces disagreed about what it meant: the
 * dashboard labelled it "Draft Announcement" and the assistant "Draft a
 * student message", so making it open an announcement quietly broke the
 * assistant's button. One id must mean one thing on every surface. */
const DESTINATIONS: Partial<
  Record<QuickActionId, { path: string; state?: Record<string, unknown> }>
> = {
  "create-assignment": { path: paths.instructor.assignmentCreate },
  "create-quiz": { path: paths.instructor.quizCreate },
  "create-feedback": { path: paths.instructor.feedbackCreate },
  // No recipients ticked, which MessageDraftPage reads as announcement mode.
  // Replaces a chat turn that had to guess between a message and an
  // announcement and then hand back to this same page anyway.
  "draft-announcement": { path: instructorMessagesPath({ tab: "compose" }) },
  // The whole roster ticked: a student message needs recipients, and an empty
  // list is the one thing this button must never open on. Deselecting back to
  // nobody turns it into an announcement, which is the same control the
  // instructor would use anyway.
  "draft-student-message": {
    path: instructorMessagesPath({ tab: "compose" }),
    state: {
      aiMessageDraft: {
        deliveryMode: "private_message",
        selectAllRecipients: true,
      },
    },
  },
};

/** Named so the instructor lands in a real turn for that specific task,
 * rather than on the same blank chat as the generic "Open AI Assistant"
 * button — see the AI assistant persona review. */
const PROMPT_BUILDERS: Partial<
  Record<QuickActionId, (course: string) => string>
> = {
  // Names the backing read action's job directly. The old wording ("grade
  // and submission performance analysis") had no tool behind it, so the
  // model answered from nothing and invented submission rates (#12).
  "analyse-missing-submissions": (course) =>
    `Analyse missing submissions for ${course}. ` +
    "Show the overview and list the students who haven't submitted.",
};

/** Stands in for the course name when the caller has no active course.
 * Deliberately not a course-shaped string: naming a course the instructor
 * does not have is the failure #1441 fixed, so the assistant is asked to
 * resolve the reference instead of being handed a fabricated one. */
const UNRESOLVED_COURSE = "my active course";

/**
 * What a quick action should do, or null when the id is unknown.
 *
 * courseLabel names the instructor's active course when the caller knows
 * it; callers that don't (the dashboard renders before a course is
 * selected) simply omit it.
 */
export function resolveQuickAction(
  actionId: string,
  courseLabel?: string,
): QuickActionBehaviour | null {
  const destination = DESTINATIONS[actionId as QuickActionId];
  if (destination) {
    return {
      kind: "navigate",
      path: destination.path,
      ...(destination.state ? { state: destination.state } : {}),
    };
  }

  const buildPrompt = PROMPT_BUILDERS[actionId as QuickActionId];
  if (buildPrompt) {
    return {
      kind: "prompt",
      prompt: buildPrompt(courseLabel?.trim() || UNRESOLVED_COURSE),
    };
  }

  // Unknown ids fall through so callers can apply their own default
  // rather than this module guessing one for them.
  return null;
}
