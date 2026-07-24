import { KeyRound } from "lucide-react";

export function ConnectCanvasHeader() {
  return (
    <div className="mb-8 text-center">
      <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <KeyRound className="size-7" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        Connect Your Canvas Account
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Add one or more Canvas API tokens to connect institution workflows.
        Course and messaging actions stay unavailable until Canvas is connected.
      </p>
    </div>
  );
}
