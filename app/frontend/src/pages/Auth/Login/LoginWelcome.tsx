// Auth page note: handles login welcome onboarding/authentication UI while keeping Canvas connection steps explicit.

export function LoginWelcome() {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to manage your Canvas workflows. Administrators use the same
        secure login and are routed to the admin dashboard after sign-in.
      </p>
    </div>
  );
}
