import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useAuth } from "@/contexts/AuthContext";
import {
  InstitutionContext,
  type InstitutionContextValue,
} from "@/contexts/institution-context";
import {
  getInstitutionData,
  institutions,
} from "@/data/institutionCourseData";
import {
  getStoredInstitutionId,
  setStoredInstitutionId,
} from "@/lib/institution-storage";
import type { CourseAnalyticsOverview } from "@/types/course";
import type { InstructorDashboardData } from "@/types/dashboard";
import { sharedDashboardQuickActions } from "@/types/dashboard";
import { fetchInstructorDashboard } from "@/services/dashboard";

const DEFAULT_INSTITUTION_ID = institutions[0]?.id ?? "ubc";

const EMPTY_ANALYTICS: CourseAnalyticsOverview = {
  averagePerformance: 0,
  averagePerformanceTrend: 0,
  activeStudents: 0,
  totalStudents: 0,
  completedAssignments: 0,
  completedAssignmentsTrend: 0,
  atRiskStudents: 0,
  atRiskStudentsTrend: 0,
};

const EMPTY_DASHBOARD: InstructorDashboardData = {
  metrics: {
    activeCourses: 0,
    activeCoursesTrend: 0,
    totalStudents: 0,
    totalStudentsTrend: 0,
    missingSubmissions: 0,
    missingSubmissionsTrend: 0,
    pendingApprovals: 0,
  },
  recentActivity: [],
  quickActions: sharedDashboardQuickActions,
  activeCourses: [],
  notifications: [],
};

function resolveInstitutionId(userId: number | undefined): string {
  if (userId) {
    const storedId = getStoredInstitutionId(userId);
    if (storedId && institutions.some((institution) => institution.id === storedId)) {
      return storedId;
    }
  }

  return DEFAULT_INSTITUTION_ID;
}

function withSharedQuickActions(
  dashboard: InstructorDashboardData,
): InstructorDashboardData {
  return {
    ...dashboard,
    quickActions:
      dashboard.quickActions.length > 0
        ? dashboard.quickActions
        : sharedDashboardQuickActions,
  };
}

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const userId = user?.id;
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(() =>
    resolveInstitutionId(userId),
  );
  const [previousUserId, setPreviousUserId] = useState(userId);
  const [previousAccessToken, setPreviousAccessToken] = useState(accessToken);
  const [apiDashboard, setApiDashboard] = useState<InstructorDashboardData | null>(
    null,
  );

  if (userId !== previousUserId) {
    setPreviousUserId(userId);
    setSelectedInstitutionId(resolveInstitutionId(userId));
    setApiDashboard(null);
  }

  if (accessToken !== previousAccessToken) {
    setPreviousAccessToken(accessToken);
    if (!accessToken) {
      setApiDashboard(null);
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const dashboard = await fetchInstructorDashboard(accessToken);
        if (!cancelled) {
          setApiDashboard(withSharedQuickActions(dashboard));
        }
      } catch {
        if (!cancelled) {
          setApiDashboard(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  const setSelectedInstitution = useCallback(
    (institutionId: string) => {
      if (!institutions.some((institution) => institution.id === institutionId)) {
        return;
      }

      setSelectedInstitutionId(institutionId);

      if (user) {
        setStoredInstitutionId(user.id, institutionId);
      }
    },
    [user],
  );

  const selectedInstitution = useMemo(
    () =>
      institutions.find((institution) => institution.id === selectedInstitutionId) ??
      institutions[0]!,
    [selectedInstitutionId],
  );

  const institutionData = useMemo(
    () => getInstitutionData(selectedInstitution.id),
    [selectedInstitution.id],
  );

  const value = useMemo<InstitutionContextValue>(
    () => ({
      institutions,
      selectedInstitution,
      setSelectedInstitution,
      courses: institutionData?.courses ?? [],
      analytics: institutionData?.analytics ?? EMPTY_ANALYTICS,
      dashboard: withSharedQuickActions(
        apiDashboard ?? institutionData?.dashboard ?? EMPTY_DASHBOARD,
      ),
    }),
    [apiDashboard, institutionData, selectedInstitution, setSelectedInstitution],
  );

  return (
    <InstitutionContext.Provider value={value}>
      {children}
    </InstitutionContext.Provider>
  );
}
