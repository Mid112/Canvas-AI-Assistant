import type { Instructor } from "@/types/instructor";
import { getInstructorFullName } from "@/types/instructor";

const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

export const mockInstructors: Instructor[] = [
  {
    id: "instructor-1",
    firstName: "Dr. Jane",
    lastName: "Doe",
    email: "professor@university.edu",
    status: "active",
    createdAt: "2024-08-12T10:00:00.000Z",
    lastLoginAt: hoursAgo(2),
  },
  {
    id: "instructor-2",
    firstName: "Dr. Sarah",
    lastName: "Smith",
    email: "ssmith@community.edu",
    status: "active",
    createdAt: "2024-09-03T14:30:00.000Z",
    lastLoginAt: hoursAgo(5),
  },
  {
    id: "instructor-3",
    firstName: "Dr. Robert",
    lastName: "Wilson",
    email: "rwilson@university.edu",
    status: "disabled",
    createdAt: "2024-07-18T09:15:00.000Z",
    lastLoginAt: hoursAgo(48),
  },
  {
    id: "instructor-4",
    firstName: "Dr. James",
    lastName: "Brown",
    email: "jbrown@tech.edu",
    status: "active",
    createdAt: "2024-10-01T16:45:00.000Z",
    lastLoginAt: hoursAgo(1),
  },
];

export function filterInstructors(
  instructors: Instructor[],
  query: string,
): Instructor[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return instructors;
  }

  return instructors.filter((instructor) => {
    const haystack = [
      getInstructorFullName(instructor),
      instructor.email,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
