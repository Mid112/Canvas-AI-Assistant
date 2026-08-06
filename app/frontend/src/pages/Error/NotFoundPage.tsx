import { Link } from "react-router-dom";
import { FileQuestion, Home } from "lucide-react";

import { paths } from "@/routes/paths";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-canvas-muted px-4 py-8">
      <div className="w-full max-w-md rounded-md border border-border bg-card px-8 py-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-primary/10">
          <FileQuestion
            className="size-10 text-primary"
            aria-hidden="true"
          />
        </div>
        <p className="text-5xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          Page Not Found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          to={paths.home}
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-base font-semibold text-white shadow-sm shadow-primary/20 hover:bg-primary/90"
        >
          <Home className="size-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
