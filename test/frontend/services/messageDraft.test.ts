import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchMessageDraft,
  MessageDraftApiError,
  sendMessageDraft,
} from "@/services/messageDraft";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const draftResponse = {
  id: 7,
  course_id: 1,
  subject: "Reminder: Programming Assignment 3 Due Friday",
  body: "Please submit on time.",
  template_id: "assignment-reminder",
  template_name: "Assignment Reminder",
  recipients: [
    { id: "student-1", name: "Alex Thompson", email: "alex.t@university.edu" },
  ],
  status: "draft",
  sent_at: null,
  created_at: "2026-06-01T12:00:00.000Z",
  updated_at: "2026-06-01T12:00:00.000Z",
};

describe("messageDraft service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and returns a draft from the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(draftResponse), { status: 201 }),
    );

    const draft = await fetchMessageDraft("access-token");
    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body),
    ) as { recipients: unknown[] };

    expect(draft.id).toBe("7");
    expect(draft.recipients.length).toBeGreaterThan(0);
    expect(draft.subject).toBeTruthy();
    expect(draft.templateName).toBe("Assignment Reminder");
    expect(requestBody.recipients).toEqual([]);
  });

  it("returns empty recipients when requested", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...draftResponse, recipients: [] }),
        { status: 201 },
      ),
    );

    const draft = await fetchMessageDraft("access-token", { emptyRecipients: true });

    expect(draft.recipients).toHaveLength(0);
  });

  it("throws when simulateLoadError is true", async () => {
    await expect(
      fetchMessageDraft("access-token", { simulateLoadError: true }),
    ).rejects.toBeInstanceOf(MessageDraftApiError);
  });

  it("throws when sending with no recipients", async () => {
    await expect(
      sendMessageDraft("access-token", {
        draftId: "1",
        subject: "Hello",
        body: "World",
        recipientIds: [],
      }),
    ).rejects.toThrow(/At least one recipient/i);
  });
});
