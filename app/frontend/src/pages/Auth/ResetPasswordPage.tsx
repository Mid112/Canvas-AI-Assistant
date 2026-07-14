import { AuthPageShell } from "@/components/layouts/AuthPageShell";
import { ResetPasswordFooter } from "@/pages/Auth/ResetPassword/ResetPasswordFooter";
import { ResetPasswordForm } from "@/pages/Auth/ResetPassword/ResetPasswordForm";
import { ResetPasswordHeader } from "@/pages/Auth/ResetPassword/ResetPasswordHeader";

export function ResetPasswordPage() {
  return (
    <AuthPageShell>
      <ResetPasswordHeader />
      <ResetPasswordForm onSubmit={async () => {}} />
      <ResetPasswordFooter />
    </AuthPageShell>
  );
}
