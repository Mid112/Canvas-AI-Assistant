import {
  CheckCircle2,
  Eye,
  MessageSquare,
  Shield,
} from "lucide-react";

import { BRAND } from "@/lib/brand";

const steps = [
  {
    step: "01",
    icon: MessageSquare,
    title: "Describe the workflow",
    description:
      "Instructors state what they need in plain language — create an assignment, message students, or review course activity.",
    detail: "Example: “Create a quiz on sorting algorithms due next Tuesday.”",
  },
  {
    step: "02",
    icon: Eye,
    title: "Review the preview",
    description:
      "The assistant drafts the Canvas action and presents the proposed changes, including affected resources and API operations.",
    detail: "Side-by-side review before anything is published to Canvas.",
  },
  {
    step: "03",
    icon: CheckCircle2,
    title: "Approve and publish",
    description:
      "Instructors confirm or modify the request. Approved actions are executed in Canvas and recorded in the audit log.",
    detail: "No write action reaches Canvas without explicit instructor approval.",
  },
] as const;

export function LandingWorkflow() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-16 border-b border-border bg-card px-6 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            A controlled workflow for Canvas changes
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {BRAND.name} is designed for academic environments where instructors
            must retain authority over course content and student communications.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {steps.map((item) => (
            <article
              key={item.step}
              className="flex flex-col rounded-md border border-border bg-background p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-2xl font-semibold text-muted-foreground/50">
                  {item.step}
                </span>
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <item.icon className="size-5" aria-hidden="true" />
                </div>
              </div>
              <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
              <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                {item.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-foreground">
          <Shield className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Irreversible actions always require instructor preview and approval.</span>
        </div>
      </div>
    </section>
  );
}
