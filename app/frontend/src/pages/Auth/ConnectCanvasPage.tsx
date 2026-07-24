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
import {
  CanvasApiError,
  describeCanvasConnectionFailures,
  updateCanvasConnections,
} from "@/services/canvas";

export function ConnectCanvasPage() {
  const navigate = useNavigate();
  const { user, logout, accessToken, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        onSubmit={async ({ connections }) => {
          setError(null);
          setIsSubmitting(true);

          try {
            if (!accessToken) {
              logout();
              return;
            }

            const result = await updateCanvasConnections(
              connections,
              accessToken,
            );

            if (result.succeeded.length === 0) {
              // Nothing saved — surface the failure without advancing onboarding.
              if (result.failed.some((item) => item.error.status === 404)) {
                setError(
                  "Canvas connection is not available yet. The backend endpoint has not been implemented.",
                );
                return;
              }

              setError(
                describeCanvasConnectionFailures(result.failed) ||
                  "Unable to connect Canvas. Please check your token and try again.",
              );
              return;
            }

            if (result.failed.length > 0) {
              // At least one connection saved, so Canvas is connected and we can
              // continue; flag the rest so the user can retry them in Settings.
              setError(
                `Some connections were not saved — ${describeCanvasConnectionFailures(result.failed)}. You can add them later in Settings.`,
              );
            }

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
