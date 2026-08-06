// Auth page note: handles register footer onboarding/authentication UI while keeping Canvas connection steps explicit.

import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function RegisterFooter() {
  return (
    <p className="mt-8 text-center text-sm text-muted-foreground">
      Already have an account?{" "}
      <Link
        to={paths.login}
        className="font-medium text-primary hover:underline"
      >
        Sign in
      </Link>{" "}
      or{" "}
      <Link
        to={paths.home}
        className="font-medium text-primary hover:underline"
      >
        Back to home
      </Link>
    </p>
  );
}
