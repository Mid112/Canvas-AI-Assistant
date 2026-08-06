// Auth page note: handles register page onboarding/authentication UI while keeping Canvas connection steps explicit.

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthPageShell } from "@/components/layouts/AuthPageShell";
import { useAuth } from "@/contexts/AuthContext";
import { getRegisterErrorMessage } from "@/lib/auth-errors";
import { RegisterFooter } from "@/pages/Auth/Register/RegisterFooter";
import { RegisterForm } from "@/pages/Auth/Register/RegisterForm";
import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";
import { RegisterWelcome } from "@/pages/Auth/Register/RegisterWelcome";
import { getPostAuthPath } from "@/utils/onboarding";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AuthPageShell>
      <RegisterHeader />
      <RegisterWelcome />
      <RegisterForm
        error={error}
        isSubmitting={isSubmitting}
        onSubmit={async (credentials) => {
          setError(null);
          setIsSubmitting(true);

          try {
            const user = await register(credentials);
            navigate(getPostAuthPath(user));
          } catch (err) {
            setError(getRegisterErrorMessage(err));
          } finally {
            setIsSubmitting(false);
          }
        }}
      />
      <RegisterFooter />
    </AuthPageShell>
  );
}
