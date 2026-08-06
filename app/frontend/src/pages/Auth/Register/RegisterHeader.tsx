// Auth page note: handles register header onboarding/authentication UI while keeping Canvas connection steps explicit.

import { BrandLogo } from "@/components/brand/BrandLogo";

export function RegisterHeader() {
  return (
    <div className="mb-8 flex justify-center">
      <BrandLogo variant="full" iconClassName="shadow-md shadow-primary/20" />
    </div>
  );
}
