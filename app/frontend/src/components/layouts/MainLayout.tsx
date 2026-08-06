// Component note: renders reusable main layout UI for the instructor/admin experience.

import { Link, Outlet } from "react-router-dom";

import { BrandLogo } from "@/components/brand/BrandLogo";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { paths } from "@/routes/paths";

export function MainLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <BrandLogo variant="full" to={paths.home} wordmarkClassName="hidden sm:block" />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" render={<Link to={paths.login} />}>
              Log in
            </Button>
            <Button render={<Link to={paths.register} />}>Get started</Button>
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6">
        <p className="text-center text-sm text-muted-foreground">
          {BRAND.name} — secure AI-powered Canvas workflows
        </p>
      </footer>
    </div>
  );
}
