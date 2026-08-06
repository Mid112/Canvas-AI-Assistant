// Auth page note: handles login footer onboarding/authentication UI while keeping Canvas connection steps explicit.

import { Link } from "react-router-dom";

import { paths } from "@/routes/paths";

export function LoginFooter() {
  return (
    <p className="mt-8 text-center text-sm text-muted-foreground">
      Don&apos;t have an account?{" "}
      <Link
        to={paths.register}
        className="font-medium text-primary hover:underline"
      >
        Sign up
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
