import {
  buildInstructorApiName,
  mapInstructorApiToInstructor,
  type InstructorApiRecord,
} from "@/lib/map-instructor";
import { apiRequest } from "@/lib/api-request";
import type {
  CreateInstructorPayload,
  Instructor,
  UpdateInstructorPayload,
} from "@/types/instructor";

const INSTRUCTORS_PATH = "/admin/instructors";

export async function fetchInstructors(
  accessToken: string,
): Promise<Instructor[]> {
  const records = await apiRequest<InstructorApiRecord[]>(
    INSTRUCTORS_PATH,
    accessToken,
  );

  return records.map(mapInstructorApiToInstructor);
}

export async function createInstructor(
  accessToken: string,
  payload: CreateInstructorPayload,
): Promise<Instructor> {
  const record = await apiRequest<InstructorApiRecord>(INSTRUCTORS_PATH, accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: buildInstructorApiName(payload.firstName, payload.lastName),
      email: payload.email.trim(),
      password: payload.temporaryPassword,
    }),
  });

  return mapInstructorApiToInstructor(record);
}

export async function updateInstructor(
  accessToken: string,
  id: string,
  payload: UpdateInstructorPayload,
): Promise<Instructor> {
  const record = await apiRequest<InstructorApiRecord>(
    `${INSTRUCTORS_PATH}/${id}`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: buildInstructorApiName(payload.firstName, payload.lastName),
        email: payload.email.trim(),
      }),
    },
  );

  return mapInstructorApiToInstructor(record);
}

export async function enableInstructor(
  accessToken: string,
  id: string,
): Promise<Instructor> {
  const record = await apiRequest<InstructorApiRecord>(
    `${INSTRUCTORS_PATH}/${id}/enable`,
    accessToken,
    { method: "POST" },
  );

  return mapInstructorApiToInstructor(record);
}

export async function disableInstructor(
  accessToken: string,
  id: string,
): Promise<Instructor> {
  const record = await apiRequest<InstructorApiRecord>(
    `${INSTRUCTORS_PATH}/${id}/disable`,
    accessToken,
    { method: "POST" },
  );

  return mapInstructorApiToInstructor(record);
}

export async function revokeInstructorAccess(
  accessToken: string,
  id: string,
): Promise<void> {
  await apiRequest<void>(`${INSTRUCTORS_PATH}/${id}/access`, accessToken, {
    method: "DELETE",
  });
}
