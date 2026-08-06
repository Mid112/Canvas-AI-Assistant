// Landing page note: presents the landing page marketing/onboarding surface before authenticated workflows.

import { LandingFeatures } from "@/pages/Landing/LandingFeatures";
import { LandingHeader } from "@/pages/Landing/LandingHeader";
import { LandingHero } from "@/pages/Landing/LandingHero";

export function LandingPage() {
  return (
    <div className="min-h-svh scroll-smooth bg-card">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingFeatures />
      </main>
    </div>
  );
}
