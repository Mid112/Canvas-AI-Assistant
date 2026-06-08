import type { FormEvent } from "react";

import { ResetPasswordFooter } from "@/pages/Auth/ResetPassword/ResetPasswordFooter";
import { ResetPasswordForm } from "@/pages/Auth/ResetPassword/ResetPasswordForm";
import { ResetPasswordHeader } from "@/pages/Auth/ResetPassword/ResetPasswordHeader";

export function ResetPasswordPage() {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-[#e8eef4] p-4 md:p-8">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <ResetPasswordHeader />
        <ResetPasswordForm onSubmit={handleSubmit} />
        <ResetPasswordFooter />
      </div>
    </div>
  );
}
