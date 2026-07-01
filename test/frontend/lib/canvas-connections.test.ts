import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCanvasConnectionUrlForInstitution,
  getPrimaryCanvasConnectionUrl,
} from "@/lib/canvas-connections";
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
            canvas_url: "https://canvas.ubc.ca",
            created_at: "2026-06-27T00:00:00.000Z",
          },
        ],
      }),
    ).toBe("http://localhost:3000");
  });
});

describe("getCanvasConnectionUrlForInstitution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns undefined when the user has no connections", () => {
    expect(getCanvasConnectionUrlForInstitution(baseUser, "ubc")).toBeUndefined();
  });

  it("returns the connection that matches the institution Canvas URL", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");

    expect(
      getCanvasConnectionUrlForInstitution(
        {
          ...baseUser,
          canvas_connections: [
            {
              id: 1,
              canvas_url: "http://localhost:3000",
              created_at: "2026-06-26T00:00:00.000Z",
            },
            {
              id: 2,
              canvas_url: "https://canvas.ubc.ca",
              created_at: "2026-06-27T00:00:00.000Z",
            },
          ],
        },
        "ubc",
      ),
    ).toBe("https://canvas.ubc.ca");
  });

  it("falls back to the sole saved connection when institution env is unset", () => {
    vi.unstubAllEnvs();

    expect(
      getCanvasConnectionUrlForInstitution(
        {
          ...baseUser,
          canvas_connections: [
            {
              id: 1,
              canvas_url: "http://localhost:3000",
              created_at: "2026-06-26T00:00:00.000Z",
            },
          ],
        },
        "ubc",
      ),
    ).toBe("http://localhost:3000");
  });

  it("falls back to the sole local connection even when env points at production", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");

    expect(
      getCanvasConnectionUrlForInstitution(
        {
          ...baseUser,
          canvas_connections: [
            {
              id: 1,
              canvas_url: "http://localhost:3000",
              created_at: "2026-06-26T00:00:00.000Z",
            },
          ],
        },
        "ubc",
      ),
    ).toBe("http://localhost:3000");
  });

  it("returns undefined when multiple connections exist but none match the institution", () => {
    expect(
      getCanvasConnectionUrlForInstitution(
        {
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
        },
        "ubc",
      ),
    ).toBeUndefined();
  });
});
