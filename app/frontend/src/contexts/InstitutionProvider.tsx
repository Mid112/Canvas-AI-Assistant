// Context note: shares institution provider state across route trees without prop-drilling.

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
import { getConnectedInstitutions } from "@/lib/canvas-connections";
import {
  getStoredInstitutionId,
  setStoredInstitutionId,
} from "@/lib/institution-storage";
import type { CourseAnalyticsOverview } from "@/types/course";
import type { InstructorDashboardData } from "@/types/dashboard";
import type { User } from "@/types/user";
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

function resolveInstitutionId(
  userId: number | undefined,
  user: User | null,
): string {
  const connectedInstitutions = getConnectedInstitutions(user, institutions);

  if (connectedInstitutions.length > 0) {
    if (userId) {
      const storedId = getStoredInstitutionId(userId);
      if (
        storedId &&
        connectedInstitutions.some((institution) => institution.id === storedId)
      ) {
        return storedId;
      }
    }

    return connectedInstitutions[0]!.id;
  }

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
    resolveInstitutionId(userId, user),
  );
  const [previousUserId, setPreviousUserId] = useState(userId);
  const [previousAccessToken, setPreviousAccessToken] = useState(accessToken);
  const [apiDashboard, setApiDashboard] = useState<InstructorDashboardData | null>(
    null,
  );

  if (userId !== previousUserId) {
    setPreviousUserId(userId);
    setSelectedInstitutionId(resolveInstitutionId(userId, user));
    setApiDashboard(null);
  }

  const connectedInstitutions = useMemo(
    () => getConnectedInstitutions(user, institutions),
    [user],
  );

  if (
    connectedInstitutions.length > 0 &&
    !connectedInstitutions.some(
      (institution) => institution.id === selectedInstitutionId,
    )
  ) {
    const nextInstitutionId = connectedInstitutions[0]!.id;
    setSelectedInstitutionId(nextInstitutionId);
    if (user) {
      setStoredInstitutionId(user.id, nextInstitutionId);
    }
  }

  if (accessToken !== previousAccessToken) {
    setPreviousAccessToken(accessToken);
    if (!accessToken) {
      setApiDashboard(null);
    }
  }

  useEffect(() => {
    if (!accessToken || user?.role !== "instructor") {
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
  }, [accessToken, userId, user?.role]);

  const refreshDashboard = useCallback(async () => {
    if (!accessToken || user?.role !== "instructor") {
      return;
    }

    try {
      const dashboard = await fetchInstructorDashboard(accessToken);
      setApiDashboard(withSharedQuickActions(dashboard));
    } catch {
      // Keep whatever dashboard data is already displayed rather than blanking a
      // working dashboard on a transient failure — this is called right after a
      // chat action confirms or an assignment is created, so a single slow/failed
      // round-trip here shouldn't erase data that was correct a moment ago.
    }
  }, [accessToken, user?.role]);

  const setSelectedInstitution = useCallback(
    (institutionId: string) => {
      const isKnownCatalog = institutions.some(
        (institution) => institution.id === institutionId,
      );
      const isConnected = connectedInstitutions.some(
        (institution) => institution.id === institutionId,
      );

      if (connectedInstitutions.length > 0) {
        if (!isConnected) {
          return;
        }
      } else if (!isKnownCatalog) {
        return;
      }

      setSelectedInstitutionId(institutionId);

      if (user) {
        setStoredInstitutionId(user.id, institutionId);
      }
    },
    [connectedInstitutions, user],
  );

  const selectedInstitution = useMemo(() => {
    const fromConnected = connectedInstitutions.find(
      (institution) => institution.id === selectedInstitutionId,
    );
    if (fromConnected) {
      return fromConnected;
    }

    return (
      institutions.find((institution) => institution.id === selectedInstitutionId) ??
      institutions[0]!
    );
  }, [connectedInstitutions, selectedInstitutionId]);

  const institutionData = useMemo(
    () => getInstitutionData(selectedInstitution.id),
    [selectedInstitution.id],
  );

  const value = useMemo<InstitutionContextValue>(
    () => ({
      institutions: connectedInstitutions,
      selectedInstitution,
      setSelectedInstitution,
      courses: institutionData?.courses ?? [],
      analytics: institutionData?.analytics ?? EMPTY_ANALYTICS,
      dashboard: withSharedQuickActions(apiDashboard ?? EMPTY_DASHBOARD),
      refreshDashboard,
    }),
    [
      apiDashboard,
      connectedInstitutions,
      institutionData,
      refreshDashboard,
      selectedInstitution,
      setSelectedInstitution,
    ],
  );

  return (
    <InstitutionContext.Provider value={value}>
      {children}
    </InstitutionContext.Provider>
  );
}
