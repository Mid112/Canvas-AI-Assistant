import { createBrowserRouter } from "react-router-dom";

import { AuthLayout } from "@/components/layouts/AuthLayout";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { LandingPage } from "@/pages/Landing/LandingPage";
import { CanvasInfoPage } from "@/pages/Auth/CanvasInfoPage";
import { ConnectCanvasPage } from "@/pages/Auth/ConnectCanvasPage";
import { LoginPage } from "@/pages/Auth/LoginPage";
import { RegisterPage } from "@/pages/Auth/RegisterPage";
import { ResetPasswordPage } from "@/pages/Auth/ResetPasswordPage";
import { CanvasAuthErrorPage } from "@/pages/Error/CanvasAuthErrorPage";
import { NotFoundPage } from "@/pages/Error/NotFoundPage";
import { ReviewPermissionsPage } from "@/pages/Auth/ReviewPermissionsPage";
import { InstructorDashboardPage } from "@/pages/Instructor/InstructorDashboardPage";
import { InstructorCoursesPage } from "@/pages/Instructor/InstructorCoursesPage";
import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { InstructorAnalyticsPage } from "@/pages/Instructor/InstructorAnalyticsPage";
import { InstructorMessagesPage } from "@/pages/Instructor/InstructorMessagesPage";
import { InstructorHistoryPage } from "@/pages/Instructor/InstructorHistoryPage";
import { InstructorSettingsPage } from "@/pages/Instructor/InstructorSettingsPage";
import { TADashboardPage } from "@/pages/TA/TADashboardPage";
import { TACoursesPage } from "@/pages/TA/TACoursesPage";
import { TAMessagesPage } from "@/pages/TA/TAMessagesPage";
import { TAStudentsPage } from "@/pages/TA/TAStudentsPage";
import { TASettingsPage } from "@/pages/TA/TASettingsPage";
import { AdminDashboardPage } from "@/pages/Admin/AdminDashboardPage";
import { AdminUsersPage } from "@/pages/Admin/AdminUsersPage";
import { AdminAuditPage } from "@/pages/Admin/AdminAuditPage";
import { AdminSettingsPage } from "@/pages/Admin/AdminSettingsPage";
import { ProfilePage } from "@/pages/Profile/ProfilePage";
import { GuestRoute } from "@/routes/GuestRoute";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { RootLayout } from "@/routes/RootLayout";
import { paths } from "@/routes/paths";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: paths.home, element: <LandingPage /> },
      {
        element: <GuestRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: paths.login, element: <LoginPage /> },
              { path: paths.register, element: <RegisterPage /> },
              { path: paths.resetPassword, element: <ResetPasswordPage /> },
            ],
          },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: paths.canvasInfo, element: <CanvasInfoPage /> },
              { path: paths.connectCanvas, element: <ConnectCanvasPage /> },
              {
                path: paths.reviewPermissions,
                element: <ReviewPermissionsPage />,
              },
              { path: paths.canvasAuthError, element: <CanvasAuthErrorPage /> },
            ],
          },
          {
            element: <DashboardLayout role="instructor" />,
            children: [
              {
                path: paths.instructor.dashboard,
                element: <InstructorDashboardPage />,
              },
              {
                path: paths.instructor.courses,
                element: <InstructorCoursesPage />,
              },
              {
                path: paths.instructor.assistant,
                element: <InstructorAssistantPage />,
              },
              {
                path: paths.instructor.analytics,
                element: <InstructorAnalyticsPage />,
              },
              {
                path: paths.instructor.messages,
                element: <InstructorMessagesPage />,
              },
              {
                path: paths.instructor.history,
                element: <InstructorHistoryPage />,
              },
              {
                path: paths.instructor.settings,
                element: <InstructorSettingsPage />,
              },
              { path: paths.instructor.profile, element: <ProfilePage /> },
            ],
          },
          {
            element: <DashboardLayout role="ta" />,
            children: [
              { path: paths.ta.dashboard, element: <TADashboardPage /> },
              { path: paths.ta.courses, element: <TACoursesPage /> },
              { path: paths.ta.messages, element: <TAMessagesPage /> },
              { path: paths.ta.students, element: <TAStudentsPage /> },
              { path: paths.ta.settings, element: <TASettingsPage /> },
              { path: paths.ta.profile, element: <ProfilePage /> },
            ],
          },
          {
            element: <DashboardLayout role="admin" />,
            children: [
              { path: paths.admin.dashboard, element: <AdminDashboardPage /> },
              { path: paths.admin.users, element: <AdminUsersPage /> },
              { path: paths.admin.audit, element: <AdminAuditPage /> },
              { path: paths.admin.settings, element: <AdminSettingsPage /> },
              { path: paths.admin.profile, element: <ProfilePage /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
