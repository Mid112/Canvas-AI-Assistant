import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { ConnectCanvasHelp } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHelp";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { paths } from "@/routes/paths";
import { CanvasApiError, updateCanvasTokens } from "@/services/canvas";
import { getAssistantPath } from "@/utils/navigation";

export function ConnectCanvasPage() {
  const navigate = useNavigate();
  const { user, logout, accessToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finishWithoutCanvas = () => {
    if (user) {
      markOnboardingComplete(user.id);
    }

    navigate(getAssistantPath(user?.role ?? "instructor"));
  };

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
            accessToken={accessToken}
            error={error}
            isSubmitting={isSubmitting}
            onSessionExpired={logout}
            onSkip={finishWithoutCanvas}
            onSubmit={async ({ canvasTokens }) => {
              setError(null);
              setIsSubmitting(true);

              if (!accessToken) {
                logout();
                return;
              }

              try {
                await updateCanvasTokens(canvasTokens, accessToken);
                navigate(paths.reviewPermissions);
              } catch (err) {
                if (err instanceof CanvasApiError && err.status === 401) {
                  logout();
                  return;
                }

                if (err instanceof CanvasApiError && err.status === 404) {
                  setError(
                    "Canvas connection is not available yet. The backend endpoint has not been implemented.",
                  );
                  return;
                }

                setError(
                  err instanceof CanvasApiError && err.message
                    ? err.message
                    : "Unable to connect Canvas. Please check your token and try again.",
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
