import { describe, expect, it } from "vitest";

import {
  editInstructorFormSchema,
  instructorFormSchema,
} from "@/schemas/instructorSchema";

describe("instructorSchema", () => {
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

  it("rejects whitespace-only temporary passwords", () => {
    const result = instructorFormSchema.safeParse({
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@university.edu",
      temporaryPassword: "        ",
    });

    expect(result.success).toBe(false);
  });

  it("validates edit instructor form fields", () => {
    const result = editInstructorFormSchema.safeParse({
      firstName: "",
      lastName: "Doe",
      email: "not-an-email",
    });

    expect(result.success).toBe(false);
  });
});
