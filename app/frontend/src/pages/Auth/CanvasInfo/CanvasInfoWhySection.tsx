import { Check } from "lucide-react";

const BENEFITS = [
  "Understand your course structure and content",
  "Preview workflow actions before execution",
  "Automate repetitive course management tasks",
  "Maintain audit logs of all changes",
];

export function CanvasInfoWhySection() {
  return (
    <section
      aria-labelledby="why-canvas-access-heading"
      className="mb-5 rounded-xl bg-[#eff6ff] px-5 py-4"
    >
      <h2
        id="why-canvas-access-heading"
        className="text-sm font-semibold text-[#1e293b]"
      >
        Why Canvas Access is Required
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[#475569]">
        To provide intelligent workflow assistance, we need secure access to
        your Canvas LMS. This allows us to:
      </p>
      <ul className="mt-3 space-y-2">
        {BENEFITS.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5">
            <Check
              className="mt-0.5 size-4 shrink-0 text-[#2563eb]"
              aria-hidden="true"
            />
            <span className="text-sm text-[#475569]">{benefit}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
