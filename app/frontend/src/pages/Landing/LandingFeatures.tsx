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
    <section id="features" className="px-6 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-6xl space-y-12">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#1e293b]">
            Powerful Features for Educators
          </h2>
          <p className="text-base leading-relaxed text-[#64748b]">
            Everything you need to streamline your Canvas workflow while
            maintaining security and control
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="space-y-4 rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
                <feature.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-[#1e293b]">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#64748b]">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
