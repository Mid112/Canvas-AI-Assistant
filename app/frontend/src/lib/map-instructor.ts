// Frontend helper note: centralizes map instructor behavior so components and tests share one implementation.

import type { Instructor } from "@/types/instructor";

export interface InstructorApiRecord {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export function splitInstructorName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0]!, lastName: "" };
  }

  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(" "),
  };
}

export function mapInstructorApiToInstructor(
  record: InstructorApiRecord,
): Instructor {
  const { firstName, lastName } = splitInstructorName(record.name);

  return {
    id: String(record.id),
    firstName,
    lastName,
    email: record.email,
    status: record.is_active ? "active" : "disabled",
    createdAt: record.created_at,
    lastLoginAt: null,
  };
}

export function buildInstructorApiName(
  firstName: string,
  lastName: string,
): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}
