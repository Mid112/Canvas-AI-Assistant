import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { paths } from "@/routes/paths";

export function LandingHero() {
  return (
    <section className="bg-gradient-to-b from-[#f0f7ff] to-white px-6 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-[#1e293b] md:text-5xl">
          Manage Canvas Workflows Using Natural Language
        </h1>
        <p className="text-lg leading-relaxed text-[#64748b]">
          Streamline your course management with AI-powered assistance. Create
          assignments, manage grades, and organize content using simple
          conversational commands.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Button
            size="lg"
            className="h-11 rounded-lg bg-[#2563eb] px-6 text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
            render={<Link to={paths.register} />}
          >
            Get Started
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-lg border-[#2563eb] bg-white px-6 text-base font-semibold text-[#2563eb] hover:bg-[#eff6ff]"
            render={<a href="#features" />}
          >
            Learn More
          </Button>
        </div>
      </div>
    </section>
  );
}
