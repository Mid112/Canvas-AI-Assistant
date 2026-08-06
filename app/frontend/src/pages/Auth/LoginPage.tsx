// Auth page note: handles login page onboarding/authentication UI while keeping Canvas connection steps explicit.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthPageShell } from "@/components/layouts/AuthPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { getLoginErrorMessage } from "@/lib/auth-errors";
import { LoginFooter } from "@/pages/Auth/Login/LoginFooter";
import { LoginForm } from "@/pages/Auth/Login/LoginForm";
import { LoginHeader } from "@/pages/Auth/Login/LoginHeader";
import { LoginWelcome } from "@/pages/Auth/Login/LoginWelcome";
import { getPostAuthPath } from "@/utils/onboarding";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AuthPageShell>
      <LoginHeader />
      <LoginWelcome />
      <LoginForm
        error={error}
        isSubmitting={isSubmitting}
        onSubmit={async (credentials) => {
          setError(null);
          setIsSubmitting(true);

          try {
            const user = await login(credentials);
            navigate(getPostAuthPath(user));
          } catch (err) {
            setError(getLoginErrorMessage(err));
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
      <LoginFooter />
    </AuthPageShell>
  );
}
