import { useState } from "react";
import { useNavigate } from "react-router-dom";

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
    <div className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-[#e8eef4] p-4 md:p-8">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
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
              navigate(getPostAuthPath(user.id, user.role));
            } catch (err) {
              setError(getRegisterErrorMessage(err));
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
        <RegisterFooter />
      </div>
    </div>
  );
}
