// Auth page note: handles canvas info page onboarding/authentication UI while keeping Canvas connection steps explicit.

import { useNavigate } from "react-router-dom";

import { OnboardingPageShell } from "@/components/layouts/OnboardingPageShell";
import { CanvasInfoActions } from "@/pages/Auth/CanvasInfo/CanvasInfoActions";
import { CanvasInfoHeader } from "@/pages/Auth/CanvasInfo/CanvasInfoHeader";
import { CanvasInfoPermissions } from "@/pages/Auth/CanvasInfo/CanvasInfoPermissions";
import { CanvasInfoSecurity } from "@/pages/Auth/CanvasInfo/CanvasInfoSecurity";
import { CanvasInfoWhySection } from "@/pages/Auth/CanvasInfo/CanvasInfoWhySection";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { paths } from "@/routes/paths";

export function CanvasInfoPage() {
  const navigate = useNavigate();

  return (
    <OnboardingPageShell progress={<OnboardingProgress currentStep="canvasInfo" />}>
      <CanvasInfoHeader />
      <CanvasInfoWhySection />
      <CanvasInfoPermissions />
      <CanvasInfoSecurity />
      <CanvasInfoActions onProceed={() => navigate(paths.connectCanvas)} />
    </OnboardingPageShell>
  );
}
