import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInstructor,
  disableInstructor,
  enableInstructor,
  fetchInstructors,
  revokeInstructorAccess,
  updateInstructor,
} from "@/services/instructorAccounts";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const instructorRecord = {
  id: 42,
  name: "New Instructor",
  email: "new@university.edu",
  role: "instructor",
  is_active: true,
  created_at: "2026-06-01T12:00:00.000Z",
};

describe("instructorAccounts service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Verifies: Fetches instructors from the API.
  it("fetches instructors from the API", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify([instructorRecord]), { status: 200 }),
    );

    const instructors = await fetchInstructors("access-token");

    expect(instructors).toHaveLength(1);
    expect(instructors[0]?.firstName).toBe("New");
    expect(instructors[0]?.lastName).toBe("Instructor");
  });

  // Verifies: Creates, updates, enables, disables, and revokes instructors.
  it("creates, updates, enables, disables, and revokes instructors", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(instructorRecord), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ...instructorRecord, name: "Updated Instructor" }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...instructorRecord, is_active: false }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...instructorRecord, is_active: true }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const created = await createInstructor("access-token", {
      firstName: "New",
      lastName: "Instructor",
      email: "new@university.edu",
      temporaryPassword: "temp-password",
    });

    expect(created.id).toBe("42");
    expect(created.lastLoginAt).toBeNull();

    const updated = await updateInstructor("access-token", created.id, {
      firstName: "Updated",
      lastName: "Instructor",
      email: "updated@university.edu",
    });
    expect(updated.firstName).toBe("Updated");

    const disabled = await disableInstructor("access-token", created.id);
    expect(disabled.status).toBe("disabled");

    const enabled = await enableInstructor("access-token", created.id);
    expect(enabled.status).toBe("active");

    await revokeInstructorAccess("access-token", created.id);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
