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
});
