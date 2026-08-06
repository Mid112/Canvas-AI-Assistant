// Test note: covers the institution provider.test behavior so future changes can preserve the expected Canvas workflow contract.

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import { useInstitution } from "@/contexts/useInstitution";
import { fetchInstructorDashboard } from "@/services/dashboard";

vi.mock("@/services/dashboard", () => ({
  fetchInstructorDashboard: vi.fn(),
}));

const mockUseAuth = vi.fn();
const mockedFetchInstructorDashboard = vi.mocked(fetchInstructorDashboard);

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

const instructorAuth = {
  user: {
    id: 1,
    email: "instructor@example.com",
    name: "Dr. Jane Doe",
    role: "instructor",
    is_active: true,
    has_canvas_token: true,
    canvas_connections: [],
  },
  accessToken: "token",
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshUser: vi.fn(),
};

const adminAuth = {
  ...instructorAuth,
  user: { ...instructorAuth.user, id: 2, email: "admin@example.com", role: "admin" },
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider>{children}</InstitutionProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockedFetchInstructorDashboard.mockResolvedValue({
    metrics: {
      activeCourses: 1,
      activeCoursesTrend: 0,
      totalStudents: 1,
      totalStudentsTrend: 0,
      missingSubmissions: 0,
      missingSubmissionsTrend: 0,
      pendingApprovals: 0,
    },
    recentActivity: [],
    quickActions: [],
    activeCourses: [],
    notifications: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("InstitutionProvider dashboard fetch", () => {
  it("does not fetch the instructor dashboard for an admin session", async () => {
    mockUseAuth.mockReturnValue(adminAuth);

    renderHook(() => useInstitution(), { wrapper });

    await waitFor(() => {
      expect(mockedFetchInstructorDashboard).not.toHaveBeenCalled();
    });
  });

  it("fetches the instructor dashboard for an instructor session", async () => {
    mockUseAuth.mockReturnValue(instructorAuth);

    renderHook(() => useInstitution(), { wrapper });

    await waitFor(() => {
      expect(mockedFetchInstructorDashboard).toHaveBeenCalledWith("token");
    });
  });

  // Verifies: refreshDashboard keeps previously-good data on a transient failure
  // instead of blanking it — this matters because it's called right after a
  // chat action confirms or an assignment is created, so a single slow/failed
  // round-trip here shouldn't erase data that was correct a moment ago.
  it("keeps the last-known-good dashboard when refreshDashboard fails", async () => {
    mockUseAuth.mockReturnValue(instructorAuth);

    const { result } = renderHook(() => useInstitution(), { wrapper });

    await waitFor(() => {
      expect(result.current.dashboard.metrics.totalStudents).toBe(1);
    });

    mockedFetchInstructorDashboard.mockRejectedValueOnce(new Error("network blip"));

    await result.current.refreshDashboard();

    expect(result.current.dashboard.metrics.totalStudents).toBe(1);
  });

  // Verifies: Tickets 26/39 — failed dashboard fetch does not fall back to seed data.
  it("uses empty dashboard defaults when the API fetch fails", async () => {
    mockUseAuth.mockReturnValue(instructorAuth);
    mockedFetchInstructorDashboard.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useInstitution(), { wrapper });

    await waitFor(() => {
      expect(mockedFetchInstructorDashboard).toHaveBeenCalled();
    });

    expect(result.current.dashboard.metrics.totalStudents).toBe(0);
    expect(result.current.dashboard.metrics.missingSubmissions).toBe(0);
    expect(result.current.dashboard.metrics.pendingApprovals).toBe(0);
    expect(result.current.dashboard.notifications).toEqual([]);
    expect(result.current.dashboard.activeCourses).toEqual([]);
  });
});

describe("InstitutionProvider connected institutions", () => {
  it("exposes only institutions with matching canvas connections", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");

    mockUseAuth.mockReturnValue({
      ...instructorAuth,
      user: {
        ...instructorAuth.user,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "https://canvas.ubc.ca",
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      },
    });

    const { result } = renderHook(() => useInstitution(), { wrapper });

    expect(result.current.institutions).toHaveLength(1);
    expect(result.current.institutions[0]?.id).toBe("ubc");
    expect(result.current.selectedInstitution.id).toBe("ubc");
  });

  it("prevents switching to institutions without a saved connection", () => {
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");

    mockUseAuth.mockReturnValue({
      ...instructorAuth,
      user: {
        ...instructorAuth.user,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "https://canvas.ubc.ca",
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      },
    });

    const { result } = renderHook(() => useInstitution(), { wrapper });

    act(() => {
      result.current.setSelectedInstitution("ubco");
    });

    expect(result.current.selectedInstitution.id).toBe("ubc");
  });
});
