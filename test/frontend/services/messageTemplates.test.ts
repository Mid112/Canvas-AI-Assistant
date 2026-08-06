import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  mapMessageTemplateResponse,
  updateMessageTemplate,
} from "@/services/messageTemplates";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("messageTemplates service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps API templates into UI template shapes", () => {
    expect(
      mapMessageTemplateResponse({
        id: 9,
        title: "Reminder",
        content: "Please submit soon.",
        course_id: 3,
        created_at: "2026-08-01T00:00:00Z",
      }),
    ).toEqual({
      id: "9",
      name: "Reminder",
      description: "Please submit soon.",
      content: "Please submit soon.",
      courseId: 3,
    });
  });

  it("lists message templates from the backend", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 1,
            title: "Reminder",
            content: "Body",
            course_id: null,
            created_at: "2026-08-01T00:00:00Z",
          },
        ]),
        { status: 200 },
      ),
    );

    const templates = await listMessageTemplates("token", 12);

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/message-templates/?course_id=12",
      expect.any(Object),
    );
    expect(templates[0]?.id).toBe("1");
  });

  it("creates, updates, and deletes templates", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 2,
            title: "New",
            content: "Content",
            course_id: null,
            created_at: "2026-08-01T00:00:00Z",
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 2,
            title: "Updated",
            content: "Content",
            course_id: null,
            created_at: "2026-08-01T00:00:00Z",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(
      createMessageTemplate("token", { title: "New", content: "Content" }),
    ).resolves.toMatchObject({ id: "2", name: "New" });
    await expect(
      updateMessageTemplate("token", "2", { title: "Updated" }),
    ).resolves.toMatchObject({ name: "Updated" });
    await expect(deleteMessageTemplate("token", "2")).resolves.toBeUndefined();
  });
});
