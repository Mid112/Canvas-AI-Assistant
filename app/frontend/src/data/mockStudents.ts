import type { CourseStudent } from "@/types/student";

/** Sample roster used when Canvas is not connected. */
export const mockCourseStudents: Record<number, CourseStudent[]> = {
  1: [
    {
      id: 1,
      canvas_user_id: "1001",
      course_id: 1,
      name: "Alex Thompson",
      sortable_name: "Thompson, Alex",
      login_id: "alex.thompson@student.ubc.ca",
      enrollment_state: "active",
    },
    {
      id: 2,
      canvas_user_id: "1002",
      course_id: 1,
      name: "Maria Garcia",
      sortable_name: "Garcia, Maria",
      login_id: "maria.garcia@student.ubc.ca",
      enrollment_state: "active",
    },
    {
      id: 3,
      canvas_user_id: "1003",
      course_id: 1,
      name: "Emma Davis",
      sortable_name: "Davis, Emma",
      login_id: "emma.davis@student.ubc.ca",
      enrollment_state: "active",
    },
    {
      id: 4,
      canvas_user_id: "1004",
      course_id: 1,
      name: "Ryan Martinez",
      sortable_name: "Martinez, Ryan",
      login_id: "ryan.martinez@student.ubc.ca",
      enrollment_state: "inactive",
    },
  ],
};

export function getMockCourseStudents(localCourseId: number): CourseStudent[] {
  return mockCourseStudents[localCourseId] ?? [];
}
