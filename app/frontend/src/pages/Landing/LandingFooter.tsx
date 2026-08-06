// Landing page note: presents the landing footer marketing/onboarding surface before authenticated workflows.

import { Link } from "react-router-dom";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND } from "@/lib/brand";
import { paths } from "@/routes/paths";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card px-6 py-10 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <BrandLogo variant="full" />
          <p className="max-w-sm text-sm text-muted-foreground">{BRAND.description}</p>
        </div>

        <div className="flex flex-wrap gap-8 text-sm">
          <div className="space-y-2">
            <p className="font-semibold text-foreground">Product</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <a href="#how-it-works" className="hover:text-primary">
                  How it works
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-primary">
                  Features
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="font-semibold text-foreground">Account</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <Link to={paths.register} className="hover:text-primary">
                  Register
                </Link>
              </li>
              <li>
                <Link to={paths.login} className="hover:text-primary">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-6xl border-t border-border pt-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}
      </p>
    </footer>
  );
}
