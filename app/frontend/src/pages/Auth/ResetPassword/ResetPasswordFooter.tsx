// Auth page note: handles reset password footer onboarding/authentication UI while keeping Canvas connection steps explicit.

import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function ResetPasswordFooter() {
  return (
    <div className="mt-8">
      <div className="border-t border-border pt-6">
        <Link
          to={paths.login}
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Return to Login
        </Link>
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">
        Powered by{" "}
        <span className="font-semibold text-muted-foreground">Canvas LMS</span>
      </p>
    </div>
  );
}
