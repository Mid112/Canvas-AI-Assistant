import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { paths } from "@/routes/paths";

export function MainLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link to={paths.home} className="flex items-center gap-2 font-semibold">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </div>
            <span className="hidden sm:inline">Canvas Workflow Assistant</span>
          </Link>
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
          Canvas Workflow Assistant — secure AI-powered Canvas workflows
        </p>
      </footer>
    </div>
  );
}
