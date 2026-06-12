import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getStoredToken } from "@/lib/auth-storage";
import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { ConnectCanvasHelp } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHelp";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { paths } from "@/routes/paths";
import { CanvasApiError, updateCanvasToken } from "@/services/canvas";

export function ConnectCanvasPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e8eef4]">
      <div className="flex min-h-svh flex-col items-center justify-center p-4 py-8 md:p-8">
        <OnboardingProgress currentStep="connectCanvas" />
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <ConnectCanvasHeader />
          <div className="mb-6">
            <ConnectCanvasHelp />
          </div>
          <ConnectCanvasForm
            error={error}
            isSubmitting={isSubmitting}
            onSubmit={async ({ canvasToken }) => {
              setError(null);
              setIsSubmitting(true);

              const accessToken = getStoredToken();
              if (!accessToken) {
                setError("You must be signed in to connect Canvas.");
                setIsSubmitting(false);
                return;
              }

              try {
                await updateCanvasToken(canvasToken, accessToken);
                navigate(paths.reviewPermissions);
              } catch (err) {
                if (err instanceof CanvasApiError && err.status === 401) {
                  setError("Your session expired. Please sign in again.");
                  return;
                }

                setError(
                  "Unable to connect Canvas. Please check your token and try again.",
                );
              } finally {
                setIsSubmitting(false);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
