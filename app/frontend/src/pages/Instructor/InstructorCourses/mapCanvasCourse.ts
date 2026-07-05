import type { InstructorCourse } from "@/types/course";
import type { CanvasCourse } from "@/types/canvas";

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
  };
}
