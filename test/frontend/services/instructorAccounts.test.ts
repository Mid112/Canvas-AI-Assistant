import { beforeEach, describe, expect, it } from "vitest";

import { mockInstructors } from "@/data/mockInstructors";
import {
  createInstructor,
  disableInstructor,
  enableInstructor,
  fetchInstructors,
  resetMockInstructors,
  revokeInstructorAccess,
  updateInstructor,
} from "@/services/instructorAccounts";

describe("instructorAccounts service", () => {
  beforeEach(() => {
    resetMockInstructors();
  });

  it("returns seeded instructors from the mock API", async () => {
    const instructors = await fetchInstructors();
    expect(instructors).toHaveLength(mockInstructors.length);
  });

  it("creates, updates, enables, disables, and revokes instructors", async () => {
    const created = await createInstructor({
      firstName: "New",
      lastName: "Instructor",
      email: "new@university.edu",
      temporaryPassword: "temp-password",
    });

    expect((await fetchInstructors()).some((item) => item.id === created.id)).toBe(
      true,
    );

    await updateInstructor(created.id, {
      firstName: "Updated",
      lastName: "Instructor",
      email: "updated@university.edu",
    });

    const updated = (await fetchInstructors()).find((item) => item.id === created.id);
    expect(updated?.firstName).toBe("Updated");

    await disableInstructor(created.id);
    expect(
      (await fetchInstructors()).find((item) => item.id === created.id)?.status,
    ).toBe("disabled");

    await enableInstructor(created.id);
    expect(
      (await fetchInstructors()).find((item) => item.id === created.id)?.status,
    ).toBe("active");

    await revokeInstructorAccess(created.id);
    expect(
      (await fetchInstructors()).find((item) => item.id === created.id),
    ).toBeUndefined();
  });
});
