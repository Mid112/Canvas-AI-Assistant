import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function RegisterFooter() {
  return (
    <p className="mt-8 text-center text-sm text-[#64748b]">
      Already have an account?{" "}
      <Link
        to={paths.login}
        className="font-medium text-[#2563eb] hover:underline"
      >
        Sign in
      </Link>{" "}
      or{" "}
      <Link
        to={paths.home}
        className="font-medium text-[#2563eb] hover:underline"
      >
        Back to home
      </Link>
    </p>
  );
}
