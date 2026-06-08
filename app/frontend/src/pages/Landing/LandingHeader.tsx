import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import { paths } from "@/routes/paths";

export function LandingHeader() {
  return (
    <header className="border-b border-[#e2e8f0] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-[#2563eb] text-white">
            <GraduationCap className="size-5" aria-hidden="true" />
          </div>
          <span className="text-base font-bold tracking-tight text-[#1e293b] md:text-lg">
            Safe AI-Powered Canvas Workflow Assistant
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a
            href="#features"
            className="text-sm font-medium text-[#475569] hover:text-[#1e293b]"
          >
            About
          </a>
          <Link
            to={paths.login}
            className="text-sm font-medium text-[#2563eb] hover:underline"
          >
            Sign In
          </Link>
        </nav>
      </div>
    </header>
  );
}
