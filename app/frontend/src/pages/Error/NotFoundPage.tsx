import { Link } from "react-router-dom";
import { FileQuestion, Home } from "lucide-react";

import { paths } from "@/routes/paths";

export function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#e8eef4] px-4 py-8">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 text-center shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-[#eff6ff]">
          <FileQuestion
            className="size-10 text-[#2563eb]"
            aria-hidden="true"
          />
        </div>
        <p className="text-5xl font-bold tracking-tight text-[#2563eb]">404</p>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-[#1e293b]">
          Page Not Found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#64748b]">
          The page you are looking for does not exist or may have been moved.
        </p>
        <Link
          to={paths.home}
          className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-[#2563eb] px-6 text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
        >
          <Home className="size-4" aria-hidden="true" />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
