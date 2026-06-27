import { mockInstructors } from "@/data/mockInstructors";
import type {
  CreateInstructorPayload,
  Instructor,
  UpdateInstructorPayload,
} from "@/types/instructor";

const STORAGE_KEY = "canvas-workflow-admin-instructors";
const MOCK_DELAY_MS = 350;

function delay(ms: number = MOCK_DELAY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readInstructors(): Instructor[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [...mockInstructors];
    }

    const parsed = JSON.parse(raw) as Instructor[];
    return Array.isArray(parsed) ? parsed : [...mockInstructors];
  } catch {
    return [...mockInstructors];
  }
}

function writeInstructors(instructors: Instructor[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instructors));
}

function getStoredInstructors(): Instructor[] {
  const instructors = readInstructors();

  if (!localStorage.getItem(STORAGE_KEY)) {
    writeInstructors(instructors);
  }

  return instructors;
}

function assertUniqueEmail(email: string, excludeId?: string): void {
  const normalizedEmail = email.trim().toLowerCase();
  const exists = getStoredInstructors().some(
    (instructor) =>
      instructor.id !== excludeId &&
      instructor.email.toLowerCase() === normalizedEmail,
  );

  if (exists) {
    throw new Error("An instructor with this email already exists.");
  }
}

/** Resets instructor list to seed data — useful for tests. */
export function resetMockInstructors(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchInstructors(): Promise<Instructor[]> {
  await delay();
  return getStoredInstructors();
}

export async function createInstructor(
  payload: CreateInstructorPayload,
): Promise<Instructor> {
  await delay();
  assertUniqueEmail(payload.email);

  const instructor: Instructor = {
    id: `instructor-${crypto.randomUUID()}`,
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    email: payload.email.trim(),
    status: "active",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  writeInstructors([instructor, ...getStoredInstructors()]);
  return instructor;
}

export async function updateInstructor(
  id: string,
  payload: UpdateInstructorPayload,
): Promise<Instructor> {
  await delay();
  assertUniqueEmail(payload.email, id);

  const instructors = getStoredInstructors();
  const index = instructors.findIndex((instructor) => instructor.id === id);

  if (index === -1) {
    throw new Error("Instructor not found.");
  }

  const updated: Instructor = {
    ...instructors[index]!,
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    email: payload.email.trim(),
  };

  const nextInstructors = [...instructors];
  nextInstructors[index] = updated;
  writeInstructors(nextInstructors);
  return updated;
}

export async function enableInstructor(id: string): Promise<Instructor> {
  await delay();
  return setInstructorStatus(id, "active");
}

export async function disableInstructor(id: string): Promise<Instructor> {
  await delay();
  return setInstructorStatus(id, "disabled");
}

export async function revokeInstructorAccess(id: string): Promise<void> {
  await delay();

  const instructors = getStoredInstructors();
  const nextInstructors = instructors.filter((instructor) => instructor.id !== id);

  if (nextInstructors.length === instructors.length) {
    throw new Error("Instructor not found.");
  }

  writeInstructors(nextInstructors);
}

function setInstructorStatus(
  id: string,
  status: Instructor["status"],
): Instructor {
  const instructors = getStoredInstructors();
  const index = instructors.findIndex((instructor) => instructor.id === id);

  if (index === -1) {
    throw new Error("Instructor not found.");
  }

  const updated: Instructor = {
    ...instructors[index]!,
    status,
  };

  const nextInstructors = [...instructors];
  nextInstructors[index] = updated;
  writeInstructors(nextInstructors);
  return updated;
}
