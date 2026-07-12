import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
