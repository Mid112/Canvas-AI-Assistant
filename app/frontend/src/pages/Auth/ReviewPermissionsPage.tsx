// Auth page note: handles review permissions page onboarding/authentication UI while keeping Canvas connection steps explicit.

import { useNavigate } from "react-router-dom";

import { OnboardingPageShell } from "@/components/layouts/OnboardingPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { ReviewPermissionsActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsActions";
import { ReviewPermissionsAllowedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsAllowedActions";
import { ReviewPermissionsHeader } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsHeader";
import { ReviewPermissionsNote } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsNote";
import { ReviewPermissionsRestrictedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsRestrictedActions";
import { paths } from "@/routes/paths";
import { getDashboardPath } from "@/utils/navigation";

export function ReviewPermissionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <OnboardingPageShell
      cardClassName="max-w-lg"
      progress={<OnboardingProgress currentStep="reviewPermissions" />}
    >
      <ReviewPermissionsHeader />
      <ReviewPermissionsAllowedActions />
      <ReviewPermissionsRestrictedActions />
      <ReviewPermissionsNote />
      <ReviewPermissionsActions
        onReconnect={() => navigate(paths.connectCanvas)}
        onApprove={() => {
          if (user) {
            markOnboardingComplete(user.id);
          }
          navigate(getDashboardPath(user?.role ?? "instructor"));
        }}
      />
    </OnboardingPageShell>
  );
}
