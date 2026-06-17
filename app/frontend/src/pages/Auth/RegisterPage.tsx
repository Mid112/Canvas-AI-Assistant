import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { AuthApiError, useAuth } from "@/contexts/AuthContext";
import { RegisterFooter } from "@/pages/Auth/Register/RegisterFooter";
import { RegisterForm } from "@/pages/Auth/Register/RegisterForm";
import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";
import { RegisterWelcome } from "@/pages/Auth/Register/RegisterWelcome";
import { paths } from "@/routes/paths";

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
        {error && (
          <p className="mb-4 text-sm text-[#dc2626]" role="alert">
            {error}
          </p>
        )}
        <RegisterForm
          isSubmitting={isSubmitting}
          onSubmit={async (credentials) => {
            setError(null);
            setIsSubmitting(true);

            try {
              await register(credentials);
              navigate(paths.canvasInfo);
            } catch (err) {
              if (err instanceof AuthApiError && err.status === 400) {
                setError("An account with this email already exists.");
              } else {
                setError("Unable to create account. Please try again.");
              }
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
