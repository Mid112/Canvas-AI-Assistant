import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function LoginFooter() {
  return (
    <p className="mt-8 text-center text-sm text-[#64748b]">
      Don&apos;t have an account?{" "}
      <Link
        to={paths.register}
        className="font-medium text-[#2563eb] hover:underline"
      >
        Sign up
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
