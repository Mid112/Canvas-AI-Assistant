import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function ResetPasswordFooter() {
  return (
    <div className="mt-8">
      <div className="border-t border-[#e2e8f0] pt-6">
        <Link
          to={paths.login}
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-[#475569] hover:text-[#1e293b]"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Return to Login
        </Link>
      </div>
      <p className="mt-8 text-center text-xs text-[#94a3b8]">
        Powered by{" "}
        <span className="font-semibold text-[#64748b]">Canvas LMS</span>
      </p>
    </div>
  );
}
