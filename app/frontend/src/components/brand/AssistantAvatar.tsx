// Component note: renders reusable assistant avatar UI for the instructor/admin experience.

import { Bot } from "lucide-react";

import { cn } from "@/lib/utils";

interface AssistantAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-8",
  md: "size-9",
  lg: "size-11",
} as const;

const iconSizes = {
  sm: "size-4",
  md: "size-4",
  lg: "size-5",
} as const;

export function AssistantAvatar({ size = "sm", className }: AssistantAvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary",
        sizeClasses[size],
        className,
      )}
      aria-hidden="true"
    >
      <Bot className={iconSizes[size]} />
    </div>
  );
}
