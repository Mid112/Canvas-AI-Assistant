// Auth page note: handles register welcome onboarding/authentication UI while keeping Canvas connection steps explicit.

export function RegisterWelcome() {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        Create Account
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Get started with Canvas workflow automation.
      </p>
    </div>
  );
}
