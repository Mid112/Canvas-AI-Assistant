import { mockInstructors } from "@/data/mockInstructors";
import { API_BASE_URL } from "@/config/api";
import { getStoredToken } from "@/lib/auth-storage";
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

type BackendInstructor = {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

function splitName(name: string): Pick<Instructor, "firstName" | "lastName"> {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] ?? "", lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

function mapInstructor(row: BackendInstructor): Instructor {
  return {
    id: String(row.id),
    ...splitName(row.name),
    email: row.email,
    status: row.is_active ? "active" : "disabled",
    createdAt: row.created_at,
    lastLoginAt: null,
  };
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getStoredToken();
  if (!token) {
    throw new Error("Admin session not found. Please log in again.");
  }

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = "Unable to complete this action.";
    try {
      const data = (await response.json()) as { detail?: string };
      if (typeof data.detail === "string") {
        message = data.detail;
      }
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function hasAuthToken(): boolean {
  return getStoredToken() !== null;
}

/** Resets instructor list to seed data — useful for tests. */
export function resetMockInstructors(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function fetchInstructors(): Promise<Instructor[]> {
  if (hasAuthToken()) {
    const rows = await apiRequest<BackendInstructor[]>("/admin/instructors");
    return rows.map(mapInstructor);
  }

  await delay();
  return getStoredInstructors();
}

export async function createInstructor(
  payload: CreateInstructorPayload,
): Promise<Instructor> {
  if (hasAuthToken()) {
    const row = await apiRequest<BackendInstructor>("/admin/instructors", {
      method: "POST",
      body: JSON.stringify({
        name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
        email: payload.email,
        password: payload.temporaryPassword,
      }),
    });
    return mapInstructor(row);
  }

  await delay();
  assertUniqueEmail(payload.email);

  // temporaryPassword is accepted for form/API shape parity only. This
  // localStorage-backed mock intentionally does not store it — real backend
  // integration must hash passwords server-side and never persist plaintext
  // passwords client-side.

  const instructor: Instructor = {
    id: `instructor-${crypto.randomUUID()}`,
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    email: payload.email.trim(),
    status: "active",
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  writeInstructors([instructor, ...getStoredInstructors()]);
  return instructor;
}

export async function updateInstructor(
  id: string,
  payload: UpdateInstructorPayload,
): Promise<Instructor> {
  if (hasAuthToken()) {
    const row = await apiRequest<BackendInstructor>(`/admin/instructors/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: [payload.firstName, payload.lastName].filter(Boolean).join(" "),
        email: payload.email,
      }),
    });
    return mapInstructor(row);
  }

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
  if (hasAuthToken()) {
    const row = await apiRequest<BackendInstructor>(
      `/admin/instructors/${id}/enable`,
      { method: "POST" },
    );
    return mapInstructor(row);
  }

  await delay();
  return setInstructorStatus(id, "active");
}

export async function disableInstructor(id: string): Promise<Instructor> {
  if (hasAuthToken()) {
    const row = await apiRequest<BackendInstructor>(
      `/admin/instructors/${id}/disable`,
      { method: "POST" },
    );
    return mapInstructor(row);
  }

  await delay();
  return setInstructorStatus(id, "disabled");
}

export async function revokeInstructorAccess(id: string): Promise<void> {
  if (hasAuthToken()) {
    await apiRequest<void>(`/admin/instructors/${id}/access`, {
      method: "DELETE",
    });
    return;
  }

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
