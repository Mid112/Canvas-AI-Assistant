// Test note: covers the instructor schema.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import {
  editInstructorFormSchema,
  instructorFormSchema,
} from "@/schemas/instructorSchema";

describe("instructorSchema", () => {
  // Verifies: Validates create instructor form fields.
  it("validates create instructor form fields", () => {
    const result = instructorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@university.edu",
      temporaryPassword: "short",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("8 characters");
    }
  });

  // Verifies: Rejects whitespace-only temporary passwords.
  it("rejects whitespace-only temporary passwords", () => {
    const result = instructorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@university.edu",
      temporaryPassword: "        ",
    });

    expect(result.success).toBe(false);
  });

  // Verifies: Validates edit instructor form fields.
  it("validates edit instructor form fields", () => {
    const result = editInstructorFormSchema.safeParse({
      firstName: "",
      lastName: "Doe",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });
});
