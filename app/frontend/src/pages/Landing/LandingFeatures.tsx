// Landing page note: presents the landing features marketing/onboarding surface before authenticated workflows.

import { ClipboardList, Eye, MessageSquare, Shield } from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "Conversational AI",
    description:
      "Interact with Canvas using natural language. Simply describe what you need, and let AI handle the complexity.",
  },
  {
    icon: Eye,
    title: "Workflow Previews",
    description:
      "Review and approve all actions before they execute. Maintain full control over your course content.",
  },
  {
    icon: Shield,
    title: "Local AI Privacy",
    description:
      "Your data stays secure with local AI processing. Enterprise-grade privacy for educational institutions.",
  },
  {
    icon: ClipboardList,
    title: "Audit Logging",
    description:
      "Complete transparency with detailed logs of all actions. Meet compliance requirements with ease.",
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="scroll-mt-4 px-6 pb-16 pt-2 md:px-8 md:pb-20 md:pt-4">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Powerful Features for Educators
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Everything you need to streamline your Canvas workflow while
            maintaining security and control
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
