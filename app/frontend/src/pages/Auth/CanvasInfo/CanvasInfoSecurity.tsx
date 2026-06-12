import { Lock, Shield } from "lucide-react";

const SECURITY_FEATURES = [
  {
    title: "Enterprise-Grade Encryption",
    description:
      "All data is encrypted in transit and at rest using industry standards.",
  },
  {
    title: "Local AI Processing",
    description: "Your data stays within your institution's infrastructure.",
  },
  {
    title: "Revocable Access",
    description:
      "You can disconnect Canvas access at any time from settings.",
  },
];

export function CanvasInfoSecurity() {
  return (
    <section
      aria-labelledby="security-privacy-heading"
      className="mb-6 rounded-xl bg-[#f0fdf4] px-5 py-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Shield className="size-4 text-[#16a34a]" aria-hidden="true" />
        <h2
          id="security-privacy-heading"
          className="text-sm font-semibold text-[#1e293b]"
        >
          Security &amp; Privacy
        </h2>
      </div>
      <ul className="space-y-3">
        {SECURITY_FEATURES.map((feature) => (
          <li key={feature.title} className="flex items-start gap-2.5">
            <Lock
              className="mt-0.5 size-4 shrink-0 text-[#16a34a]"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-[#1e293b]">
                {feature.title}
              </p>
              <p className="text-sm text-[#64748b]">{feature.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
