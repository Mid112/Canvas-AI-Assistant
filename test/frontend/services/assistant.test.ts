import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  sendAssistantMessage,
} from "@/services/assistant";

describe("sendAssistantMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails only when the message contains fail please", async () => {
    const assertion = expect(sendAssistantMessage("fail please")).rejects.toThrow(
      "The assistant is temporarily unavailable. Please try again.",
    );
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });

  it("does not fail for phrases that contain fail without please", async () => {
    const responsePromise = sendAssistantMessage("fail students in COSC 499");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      content: expect.any(String),
    });
  });

  it("blocks unsafe requests with a safety message", async () => {
    const responsePromise = sendAssistantMessage("delete all students");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      safetyBlocked: true,
      safetyMessage: expect.stringContaining("cannot complete"),
    });
  });

  it("blocks rephrased destructive requests", async () => {
    const responsePromise = sendAssistantMessage("erase every student");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      safetyBlocked: true,
      safetyMessage: expect.stringContaining("cannot complete"),
    });
  });

  it("asks who should receive a message when recipients are omitted", async () => {
    const responsePromise = sendAssistantMessage(
      "send a message about the midterm exam",
    );
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      safetyBlocked: true,
      safetyMessage: expect.stringContaining("which students or group"),
    });
  });

  it("does not treat escalate as a late-submission keyword", async () => {
    const responsePromise = sendAssistantMessage(
      "send a message to escalate this issue",
    );
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      safetyBlocked: true,
      safetyMessage: expect.stringContaining("which students or group"),
    });
  });

  it("asks for clarification on vague requests", async () => {
    const responsePromise = sendAssistantMessage("help");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      safetyBlocked: true,
      safetyMessage: expect.stringContaining("more detail"),
    });
  });

  it("returns course data answers using active course context", async () => {
    const responsePromise = sendAssistantMessage("how many students are enrolled?", {
      activeCourseLabel: "CS 101: Intro",
    });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      content: expect.stringContaining("CS 101: Intro"),
      explanation: expect.any(String),
    });
  });

  it("links missing submission actions to dry-run preview", async () => {
    const responsePromise = sendAssistantMessage("show missing submissions");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(responsePromise).resolves.toMatchObject({
      interpretedAction: {
        previewId: "workflow-student-reminder",
        primaryLink: {
          label: "Preview workflow",
          href: expect.stringContaining("workflow-student-reminder"),
        },
      },
    });
  });
});
