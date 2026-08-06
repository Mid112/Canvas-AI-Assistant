// Landing page note: presents the landing header marketing/onboarding surface before authenticated workflows.

import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { paths } from "@/routes/paths";

export function LandingHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-8">
        <BrandLogo
          to={paths.home}
          variant="full"
          landing
          iconClassName="size-9 rounded-lg"
          wordmarkClassName="[&_span]:text-sm [&_span]:font-bold [&_span]:leading-snug sm:[&_span]:text-base md:[&_span]:text-lg"
        />
        <nav className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            About
          </a>
          <Link
            to={paths.login}
            className="text-sm font-medium text-primary hover:underline"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}
