import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { paths } from "@/routes/paths";

export function LandingCta() {
  return (
    <section className="border-t border-border bg-canvas-muted px-6 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Deploy safer Canvas workflows at your institution
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          {BRAND.tagline} Register to connect Canvas and begin managing course
          operations with instructor approval at every step.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" className="rounded-md px-8" render={<Link to={paths.register} />}>
            Create account
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-md px-8"
            render={<Link to={paths.login} />}
          >
            Sign in
          </Button>
        </div>
      </div>
    </section>
  );
}
