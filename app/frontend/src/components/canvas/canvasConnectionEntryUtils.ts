import type { TokenValidationState } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";

export interface CanvasConnectionEntryState {
  id: string;
  canvasUrl: string;
  canvasToken: string;
  validation: TokenValidationState;
}

export const canvasConnectionInputClassName =
  "h-11 rounded-lg border-border bg-card px-3.5 text-foreground shadow-none placeholder:text-muted-foreground";

export const canvasConnectionLabelClassName =
  "text-sm font-semibold text-foreground";

export function createCanvasConnectionEntry(): CanvasConnectionEntryState {
  return {
    id: crypto.randomUUID(),
    canvasUrl: "",
    canvasToken: "",
    validation: { status: "idle" },
  };
}

export function getCanvasInstitutionLabel(index: number): string {
  if (index === 0) {
    return "Institution";
  }

  return `Institution ${index + 1}`;
}

export function isCanvasTokenValidationComplete(
  token: string,
  validation: TokenValidationState,
): boolean {
  const trimmedToken = token.trim();

  if (trimmedToken === "") {
    return true;
  }

  return validation.status === "valid";
}
