import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchMessageDraft,
  MessageDraftApiError,
  sendMessageDraft,
} from "@/services/messageDraft";

describe("messageDraft service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns mock draft by default", async () => {
    const promise = fetchMessageDraft();
    await vi.runAllTimersAsync();
    const draft = await promise;

    expect(draft.recipients.length).toBeGreaterThan(0);
    expect(draft.subject).toBeTruthy();
    expect(draft.templateName).toBe("Assignment Reminder");
  });

  it("returns empty recipients when requested", async () => {
    const promise = fetchMessageDraft({ emptyRecipients: true });
    await vi.runAllTimersAsync();
    const draft = await promise;

    expect(draft.recipients).toHaveLength(0);
  });

  it("throws when simulateLoadError is true", async () => {
    const promise = fetchMessageDraft({ simulateLoadError: true });
    const expectation = expect(promise).rejects.toBeInstanceOf(MessageDraftApiError);
    await vi.runAllTimersAsync();
    await expectation;
  });

  it("throws when sending with no recipients", async () => {
    const promise = sendMessageDraft({
      draftId: "draft-1",
      subject: "Hello",
      body: "World",
      recipientIds: [],
    });
    const expectation = expect(promise).rejects.toThrow(/At least one recipient/i);
    await vi.runAllTimersAsync();
    await expectation;
  });
});
