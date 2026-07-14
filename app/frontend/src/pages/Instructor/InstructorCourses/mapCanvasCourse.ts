import type { InstructorCourse } from "@/types/course";
import type { CanvasCourse } from "@/types/canvas";

// The only Canvas workflow_state that allows Canvas-content writes (create/
// update assignment, send message) — mirrors the backend's
// WRITABLE_WORKFLOW_STATE in app/backend/app/services/canvas.py. Keep in sync.
export const WRITABLE_WORKFLOW_STATE = "available";

// Canvas workflow_states that count as "selectable as the active course" — a
// concluded course can still be reviewed, just not written to (see
// WRITABLE_WORKFLOW_STATE). Mirrors the backend's SELECTABLE_WORKFLOW_STATES
// (get_courses' flip-detection and set_active_course's rejection check) —
// keep both in sync if this ever changes.
export const SELECTABLE_WORKFLOW_STATES = new Set([WRITABLE_WORKFLOW_STATE, "completed"]);

export function mapCanvasCourseToInstructorCourse(
  course: CanvasCourse,
  canvasUrl: string,
  assignmentCount = 0,
): InstructorCourse | null {
  // Courses without a synced local row cannot be linked from in-app routes yet.
  if (course.local_id == null) {
    return null;
  }

  return {
    // id is the local DB id — used in React Router paths and active-course preference.
    id: course.local_id,
    // Metadata from the Canvas sync response; assignment APIs use local id + connection URL.
    canvasCourseId: course.canvas_id,
    canvasUrl,
    code: course.course_code,
    name: course.name,
    progress: 0,
    studentCount: course.total_students ?? 0,
    assignmentCount,
    // Placeholder until we have real activity/progress aggregation from Canvas.
    lastActivity: "Synced from Canvas",
    // "available" or "completed" are selectable/reviewable — "unpublished" (a
    // draft) and "deleted" courses are not, matching set_active_course's check.
    isPublished: SELECTABLE_WORKFLOW_STATES.has(course.workflow_state),
    // Only "available" allows writes — a completed course is selectable above
    // but read-only, matching require_writable_course on the backend.
    isWritable: course.workflow_state === WRITABLE_WORKFLOW_STATE,
    term: course.term_name,
  };
}
