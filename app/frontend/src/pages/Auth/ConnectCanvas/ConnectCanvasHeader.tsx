import { KeyRound } from "lucide-react";

export function ConnectCanvasHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)]">
        <KeyRound className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
        Enter Your Canvas API Token
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[#64748b]">
        Paste the access token from your Canvas account to connect your courses
      </p>
    </div>
  );
}
