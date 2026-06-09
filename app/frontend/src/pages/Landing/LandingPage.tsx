import { LandingFeatures } from "@/pages/Landing/LandingFeatures";
import { LandingHeader } from "@/pages/Landing/LandingHeader";
import { LandingHero } from "@/pages/Landing/LandingHero";

export function LandingPage() {
  return (
    <div className="min-h-svh bg-white">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingFeatures />
      </main>
    </div>
  );
}
