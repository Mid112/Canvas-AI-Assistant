import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { paths } from "@/routes/paths";

export function ConnectCanvasPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e8eef4]">
      <div className="flex min-h-svh flex-col items-center justify-center p-4 py-8 md:p-8">
        <OnboardingProgress currentStep="connectCanvas" />
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <h1 className="text-center text-2xl font-bold text-[#1e293b]">
            Connect Canvas Account
          </h1>
          <p className="mt-3 text-center text-sm leading-relaxed text-[#64748b]">
            Authorize access to your Canvas account so the assistant can help
            with courses, assignments, and submissions.
          </p>
          <Button
            type="button"
            onClick={() => navigate(paths.reviewPermissions)}
            className="mt-8 h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
          >
            Connect with Canvas
          </Button>
        </div>
      </div>
    </div>
  );
}
