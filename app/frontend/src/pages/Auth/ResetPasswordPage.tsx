// Auth page note: handles reset password page onboarding/authentication UI while keeping Canvas connection steps explicit.

import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { AuthPageShell } from "@/components/layouts/AuthPageShell";
import { getLoginErrorMessage } from "@/lib/auth-errors";
import { ResetPasswordConfirmForm } from "@/pages/Auth/ResetPassword/ResetPasswordConfirmForm";
import { ResetPasswordFooter } from "@/pages/Auth/ResetPassword/ResetPasswordFooter";
import { ResetPasswordForm } from "@/pages/Auth/ResetPassword/ResetPasswordForm";
import { ResetPasswordHeader } from "@/pages/Auth/ResetPassword/ResetPasswordHeader";
import { paths } from "@/routes/paths";
import {
  AuthApiError,
  confirmPasswordReset,
  requestPasswordReset,
} from "@/services/auth";

type ResetPasswordLocationState = {
  resetToken?: string;
};

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tokenFromState = useMemo(() => {
    const state = location.state as ResetPasswordLocationState | null;
    return state?.resetToken?.trim() || null;
  }, [location.state]);
  const tokenFromQuery = useMemo(
    () => searchParams.get("token")?.trim() || null,
    [searchParams],
  );
  const initialToken = tokenFromState ?? tokenFromQuery;

  const [resetToken, setResetToken] = useState<string | null>(initialToken);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [requestCompletedWithoutToken, setRequestCompletedWithoutToken] =
    useState<string | null>(null);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  if (passwordUpdated) {
    return (
      <AuthPageShell>
        <ResetPasswordHeader />
        <div className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground" role="status">
            Your password has been updated. You can sign in with your new
            password.
          </p>
          <Link
            to={paths.login}
            className="inline-flex text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Return to Login
          </Link>
        </div>
        <ResetPasswordFooter />
      </AuthPageShell>
    );
  }

  if (resetToken) {
    return (
      <AuthPageShell>
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Choose a New Password
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Enter a new password for your account. This will sign you out of
            other sessions.
          </p>
        </div>
        <ResetPasswordConfirmForm
          error={confirmError}
          isSubmitting={isConfirming}
          onSubmit={async (password) => {
            setConfirmError(null);
            setIsConfirming(true);
            try {
              await confirmPasswordReset(resetToken, password);
              setPasswordUpdated(true);
            } catch (err) {
              setConfirmError(
                err instanceof AuthApiError
                  ? err.message
                  : getLoginErrorMessage(err),
              );
            } finally {
              setIsConfirming(false);
            }
          }}
        />
        <ResetPasswordFooter />
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <ResetPasswordHeader />
      {requestCompletedWithoutToken ? (
        <div className="space-y-4 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground" role="status">
            {requestCompletedWithoutToken}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setRequestCompletedWithoutToken(null);
              setRequestError(null);
            }}
          >
            Try another email
          </button>
        </div>
      ) : (
        <ResetPasswordForm
          error={requestError}
          isSubmitting={isRequesting}
          onSubmit={async (email) => {
            setRequestError(null);
            setIsRequesting(true);
            try {
              const result = await requestPasswordReset(email);
              // Production never returns reset_token (anti-enumeration + no
              // public secret). DEBUG/e2e may include it so local testing can
              // finish confirm without SMTP; only then jump to the set-password
              // step. Otherwise always show the same generic acknowledgement.
              if (result.reset_token) {
                setResetToken(result.reset_token);
                // Keep DEBUG tokens out of URL history; emailed production
                // links may still arrive with ?token= in the query string.
                navigate(paths.resetPassword, {
                  replace: true,
                  state: { resetToken: result.reset_token },
                });
              } else {
                setRequestCompletedWithoutToken(result.message);
              }
            } catch (err) {
              setRequestError(
                err instanceof AuthApiError
                  ? err.message
                  : getLoginErrorMessage(err),
              );
            } finally {
              setIsRequesting(false);
            }
          }}
        />
      )}
      <ResetPasswordFooter />
    </AuthPageShell>
  );
}
