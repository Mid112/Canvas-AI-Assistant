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

  // Verifies: Creates and returns a draft from the API.
  it("creates and returns a draft from the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(draftResponse), { status: 201 }),
    );

    const draft = await fetchMessageDraft("access-token");
    const requestBody = JSON.parse(
      String(fetchSpy.mock.calls[0]?.[1]?.body),
    ) as { body?: string; prompt?: string; recipients: unknown[]; subject?: string };

    expect(draft.id).toBe("7");
    expect(draft.recipients.length).toBeGreaterThan(0);
    expect(draft.subject).toBeTruthy();
    expect(draft.templateName).toBe("Assignment Reminder");
    expect(requestBody.subject).toBe("Assignment Reminder: Course Update");
    expect(requestBody.body).toBe(requestBody.prompt);
    expect(requestBody.recipients).toEqual([]);
  });

  // Verifies: Returns empty recipients when requested.
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

  // Verifies: Keeps provided course recipients when the draft API returns none.
  it("keeps provided course recipients when the draft API returns none", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...draftResponse, recipients: [] }),
        { status: 201 },
      ),
    );

    const recipients = [
      { id: "student-101", name: "Alex Student", email: "alex@example.edu" },
    ];

    const draft = await fetchMessageDraft("access-token", { recipients });

    expect(draft.recipients).toEqual(recipients);
  });

  // Verifies: Throws when simulateLoadError is true.
  it("throws when simulateLoadError is true", async () => {
    await expect(
      fetchMessageDraft("access-token", { simulateLoadError: true }),
    ).rejects.toBeInstanceOf(MessageDraftApiError);
  });

  // Verifies: Throws when sending with no recipients.
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

  // Verifies: Persists selected recipients before sending.
  it("persists selected recipients before sending", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(draftResponse), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...draftResponse, status: "sent" }), {
          status: 200,
        }),
      );

    const recipients = [
      { id: "student-1", name: "Alex Thompson", email: "alex.t@university.edu" },
    ];

    await sendMessageDraft("access-token", {
      draftId: "7",
      subject: "Reminder",
      body: "Please submit.",
      recipientIds: ["student-1"],
      recipients,
    });

    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "http://localhost:8000/api/v1/messages/drafts/7",
    );
    expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({
      subject: "Reminder",
      body: "Please submit.",
      recipients,
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "http://localhost:8000/api/v1/messages/drafts/7/send",
    );
  });

  // Verifies: Rejects sending when selected recipient details are missing.
  it("rejects sending when selected recipient details are missing", async () => {
    await expect(
      sendMessageDraft("access-token", {
        draftId: "7",
        subject: "Reminder",
        body: "Please submit.",
        recipientIds: ["student-1"],
      }),
    ).rejects.toThrow(/out of sync/i);
  });
});
