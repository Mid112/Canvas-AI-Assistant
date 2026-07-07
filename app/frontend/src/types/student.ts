/** Matches GET /api/v1/canvas/courses/{localCourseId}/students response item. */
export interface CourseStudent {
  id: number;
  canvas_user_id: string;
  course_id: number;
  name: string;
  sortable_name: string | null;
  login_id: string | null;
  enrollment_state: string;
}
