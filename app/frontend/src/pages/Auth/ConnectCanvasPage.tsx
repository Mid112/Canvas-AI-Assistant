import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { OnboardingPageShell } from "@/components/layouts/OnboardingPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { markOnboardingComplete } from "@/lib/onboarding-storage";
import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { ConnectCanvasHelp } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHelp";
import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";
import { paths } from "@/routes/paths";
import { CanvasApiError, updateCanvasConnections } from "@/services/canvas";
import { getAssistantPath } from "@/utils/navigation";

export function ConnectCanvasPage() {
  const navigate = useNavigate();
  const { user, logout, accessToken, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finishWithoutCanvas = () => {
    if (user) {
      markOnboardingComplete(user.id);
    }

    navigate(getAssistantPath(user?.role ?? "instructor"));
  };

  return (
    <OnboardingPageShell progress={<OnboardingProgress currentStep="connectCanvas" />}>
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
        onSubmit={async ({ connections }) => {
          setError(null);
          setIsSubmitting(true);

          try {
            if (!accessToken) {
              logout();
              return;
            }

            await updateCanvasConnections(connections, accessToken);

            if (user) {
              markOnboardingComplete(user.id);
            }

            // Move forward as soon as the token save succeeds; if the follow-up
            // auth refresh has a transient failure, Canvas is still connected.
            navigate(paths.reviewPermissions);
            await refreshUser().catch(() => undefined);
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
    </OnboardingPageShell>
  );
}
