import { describe, expect, it } from "vitest";

import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import type { User } from "@/types/user";

const baseUser: User = {
  id: 1,
  email: "professor@university.edu",
  name: "Professor",
  role: "instructor",
  is_active: true,
  has_canvas_token: true,
  canvas_connections: [],
};

describe("getPrimaryCanvasConnectionUrl", () => {
  it("returns undefined when the user is missing", () => {
    expect(getPrimaryCanvasConnectionUrl(null)).toBeUndefined();
    expect(getPrimaryCanvasConnectionUrl(undefined)).toBeUndefined();
  });

  it("returns undefined when the user has no Canvas connections", () => {
    expect(getPrimaryCanvasConnectionUrl(baseUser)).toBeUndefined();
  });

  it("returns the first Canvas connection URL", () => {
    // This documents the temporary multi-school rule until the app has an
    // explicit institution selector for choosing among Canvas connections.
    expect(
      getPrimaryCanvasConnectionUrl({
        ...baseUser,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "http://localhost:3000",
            created_at: "2026-06-26T00:00:00.000Z",
          },
          {
            id: 2,
            canvas_url: "https://canvas.example.edu",
            created_at: "2026-06-27T00:00:00.000Z",
          },
        ],
      }),
    ).toBe("http://localhost:3000");
  });
});
