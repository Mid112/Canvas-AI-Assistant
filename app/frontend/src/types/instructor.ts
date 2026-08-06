// Type note: documents the instructor data contract shared by services, components, and tests.

export type InstructorStatus = "active" | "disabled";

export interface Instructor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: InstructorStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface CreateInstructorPayload {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword: string;
}

export interface UpdateInstructorPayload {
  firstName: string;
  lastName: string;
  email: string;
}

export type InstructorConfirmAction = "enable" | "disable" | "revoke";

export function getInstructorFullName(instructor: Pick<Instructor, "firstName" | "lastName">): string {
  return [instructor.firstName, instructor.lastName].filter(Boolean).join(" ");
}
