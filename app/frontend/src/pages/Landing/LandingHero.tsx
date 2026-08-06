// Landing page note: presents the landing hero marketing/onboarding surface before authenticated workflows.

import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { paths } from "@/routes/paths";

export function LandingHero() {
  return (
    <section className="bg-gradient-to-b from-primary/5 to-card px-6 pb-4 pt-16 md:px-8 md:pb-6 md:pt-20">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
          Manage Canvas Workflows Using Natural Language
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {BRAND.description}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button
            size="lg"
            className="h-11 rounded-lg px-6 text-base font-semibold shadow-sm"
            render={<Link to={paths.register} />}
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-lg border-primary px-6 text-base font-semibold text-primary hover:bg-primary/5"
            render={<a href="#features" />}
          >
            Learn More
          </Button>
        </div>
      </div>
    </section>
  );
}
