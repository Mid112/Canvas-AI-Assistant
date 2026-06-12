import { AlertCircle, GraduationCap } from "lucide-react";

export function CanvasAuthErrorHeader() {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)]">
        <GraduationCap className="size-7" aria-hidden="true" />
      </div>
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-full bg-[#fef2f2]">
        <AlertCircle
          className="size-10 text-[#dc2626]"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
        Canvas Authentication Failed
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#64748b]">
        We couldn&apos;t connect to your Canvas account. This could be due to:
      </p>
    </div>
  );
}
