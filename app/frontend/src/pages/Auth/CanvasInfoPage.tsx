import { CanvasInfoActions } from "@/pages/Auth/CanvasInfo/CanvasInfoActions";
import { CanvasInfoHeader } from "@/pages/Auth/CanvasInfo/CanvasInfoHeader";
import { CanvasInfoPermissions } from "@/pages/Auth/CanvasInfo/CanvasInfoPermissions";
import { CanvasInfoSecurity } from "@/pages/Auth/CanvasInfo/CanvasInfoSecurity";
import { CanvasInfoWhySection } from "@/pages/Auth/CanvasInfo/CanvasInfoWhySection";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";

export function CanvasInfoPage() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e8eef4]">
      <div className="flex min-h-svh flex-col items-center justify-center p-4 py-8 md:p-8">
        <OnboardingProgress currentStep="connectCanvas" />
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <CanvasInfoHeader />
          <CanvasInfoWhySection />
          <CanvasInfoPermissions />
          <CanvasInfoSecurity />
          <CanvasInfoActions onProceed={() => {}} />
        </div>
      </div>
    </div>
  );
}
