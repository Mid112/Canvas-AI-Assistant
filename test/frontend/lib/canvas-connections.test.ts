import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCanvasConnectionUrlForInstitution,
  getConnectedInstitutions,
  getPrimaryCanvasConnectionUrl,
  isInstitutionConnected,
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
  // Verifies: Returns undefined when the user is missing.
  it("returns undefined when the user is missing", () => {
    expect(getPrimaryCanvasConnectionUrl(null)).toBeUndefined();
    expect(getPrimaryCanvasConnectionUrl(undefined)).toBeUndefined();
  });

  // Verifies: Returns undefined when the user has no Canvas connections.
  it("returns undefined when the user has no Canvas connections", () => {
    expect(getPrimaryCanvasConnectionUrl(baseUser)).toBeUndefined();
  });

  // Verifies: Returns the first Canvas connection URL.
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

  // Verifies: Returns undefined when the user has no connections.
  it("returns undefined when the user has no connections", () => {
    expect(getCanvasConnectionUrlForInstitution(baseUser, "ubc")).toBeUndefined();
  });

  // Verifies: Returns the connection that matches the institution Canvas URL.
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

  // Verifies: Falls back to the sole saved connection when institution env is unset.
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

  // Verifies: Falls back to the sole local connection even when env points at production.
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

  // Verifies: Falls back to the first saved connection when multiple exist but none match.
  it("falls back to the first saved connection when multiple exist but none match", () => {
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
    ).toBe("http://localhost:3000");
  });
});

describe("isInstitutionConnected", () => {
  // Verifies: Returns false when the user has no Canvas connections.
  it("returns false when the user has no Canvas connections", () => {
    expect(isInstitutionConnected(baseUser, "ubc")).toBe(false);
    expect(isInstitutionConnected(null, "ubc")).toBe(false);
  });
});

describe("getConnectedInstitutions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const catalog = [
    { id: "ubc", name: "University of British Columbia", shortName: "UBC" },
    { id: "ubco", name: "UBC Okanagan", shortName: "UBCO" },
  ];

  // Verifies: Returns an empty list when the user has no Canvas connections.
  it("returns an empty list when the user has no Canvas connections", () => {
    expect(getConnectedInstitutions(baseUser, catalog)).toEqual([]);
    expect(getConnectedInstitutions(null, catalog)).toEqual([]);
  });

  // Verifies: Returns only institutions with a matching saved Canvas connection.
  it("returns only institutions with a matching saved Canvas connection", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");
    vi.stubEnv("VITE_CANVAS_UBCO_URL", "https://canvas.ok.ubc.ca");

    expect(
      getConnectedInstitutions(
        {
          ...baseUser,
          canvas_connections: [
            {
              id: 1,
              canvas_url: "https://canvas.ubc.ca",
              created_at: "2026-06-26T00:00:00.000Z",
            },
          ],
        },
        catalog,
      ),
    ).toEqual([catalog[0]]);
  });

  // Verifies: Ignores connections that cannot be mapped without institution env URLs.
  it("ignores connections that cannot be mapped without institution env URLs", () => {
    vi.unstubAllEnvs();

    expect(
      getConnectedInstitutions(
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
        catalog,
      ),
    ).toEqual([]);
  });
});
