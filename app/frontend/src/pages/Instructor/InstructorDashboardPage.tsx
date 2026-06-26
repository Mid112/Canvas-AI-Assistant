import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { InstructorDashboardActiveCourses } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardActiveCourses";
import { InstructorDashboardHeader } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardHeader";
import { InstructorDashboardNotifications } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardNotifications";
import { InstructorDashboardOverview } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardOverview";
import { InstructorDashboardQuickActions } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardQuickActions";
import { InstructorDashboardRecentActivity } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardRecentActivity";

export function InstructorDashboardPage() {
  const { user } = useAuth();
  const { selectedInstitution, dashboard } = useInstitution();

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorDashboardHeader
        userName={user?.name ?? "Instructor"}
        institutionShortName={selectedInstitution.shortName}
      />

      <InstructorDashboardOverview metrics={dashboard.metrics} />

      <div className="grid gap-6 lg:grid-cols-2">
        <InstructorDashboardRecentActivity
          activities={dashboard.recentActivity}
        />
        <InstructorDashboardQuickActions actions={dashboard.quickActions} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <InstructorDashboardActiveCourses courses={dashboard.activeCourses} />
        <InstructorDashboardNotifications
          notifications={dashboard.notifications}
        />
      </div>
    </div>
  );
}
