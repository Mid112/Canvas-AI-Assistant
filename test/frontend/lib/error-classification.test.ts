// Test note: covers the error classification.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { classifyErrorMessage } from "@/lib/error-classification";

describe("classifyErrorMessage", () => {
  it("classifies an invalid token message as canvas-auth", () => {
    expect(classifyErrorMessage("Invalid Canvas API token")).toBe("canvas-auth");
  });

  it("classifies a corrupted-token message as canvas-auth", () => {
    expect(
      classifyErrorMessage("Canvas token is corrupted — please reconnect Canvas."),
    ).toBe("canvas-auth");
  });

  it("classifies a permission message as canvas-auth", () => {
    expect(
      classifyErrorMessage("Canvas token lacks permission for this resource"),
    ).toBe("canvas-auth");
  });

  it("classifies a timeout message as canvas-outage", () => {
    expect(classifyErrorMessage("Canvas API timed out")).toBe("canvas-outage");
  });

  it("classifies an unreachable message as canvas-outage", () => {
    expect(classifyErrorMessage("Could not reach Canvas")).toBe("canvas-outage");
  });

  it("classifies a Canvas server error as canvas-outage", () => {
    expect(classifyErrorMessage("Canvas server error: 500")).toBe("canvas-outage");
  });

  it("classifies an unrelated message as generic", () => {
    expect(classifyErrorMessage("Something went wrong on our end.")).toBe("generic");
  });

  it("classifies duplicate-in-flight messages", () => {
    expect(
      classifyErrorMessage("Another Canvas write is already running."),
    ).toBe("duplicate-in-flight");
  });

  it("classifies validation messages", () => {
    expect(
      classifyErrorMessage("This course has concluded and is read-only."),
    ).toBe("validation");
  });

  it("is case-insensitive", () => {
    expect(classifyErrorMessage("INVALID CANVAS API TOKEN")).toBe("canvas-auth");
  });
});
