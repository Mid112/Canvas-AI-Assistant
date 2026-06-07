import { GraduationCap } from "lucide-react";

export function LoginHeader() {
  return (
    <div className="mb-8 flex items-center justify-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-lg bg-[#2563eb] text-white">
        <GraduationCap className="size-5" aria-hidden="true" />
      </div>
      <span className="text-lg font-bold tracking-tight text-[#1e293b]">
        Canvas Workflow Assistant
      </span>
    </div>
  );
}
