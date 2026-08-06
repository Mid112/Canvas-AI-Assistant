// Chat UI note: renders the assistant chat model switcher surface while preserving instructor review and cancellation flows.

import { Check, ChevronDown, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getLlmProviderOption,
  hostingLabel,
} from "@/data/llmProviders";
import { cn } from "@/lib/utils";
import { instructorSettingsPath } from "@/routes/paths";
import type { InstructorLlmProvider } from "@/services/instructorLlmProviders";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

interface ChatModelSwitcherProps {
  settings: LlmProviderSettings;
  providers: InstructorLlmProvider[];
  onProviderChange: (providerId: LlmProviderId) => void;
  disabled?: boolean;
}

export function ChatModelSwitcher({
  settings,
  providers,
  onProviderChange,
  disabled = false,
}: ChatModelSwitcherProps) {
  const navigate = useNavigate();
  const selected =
    providers.find((provider) => provider.id === settings.provider) ??
    getLlmProviderOption(settings.provider);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-7 gap-1 rounded-full px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-label="Switch AI model"
          />
        }
      >
        <span className="max-w-[9rem] truncate">{selected.name}</span>
        <ChevronDown className="size-3.5 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="top" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>AI model</DropdownMenuLabel>
          <p className="px-2 pb-1 text-xs text-muted-foreground">
            Applies to your next message. Grey items are not connected yet.
          </p>
          {providers.map((provider) => {
            const isActive = provider.id === settings.provider;
            const isConnected = provider.connected;
            return (
              <DropdownMenuItem
                key={provider.id}
                disabled={!isConnected}
                onClick={() => {
                  if (isConnected) {
                    onProviderChange(provider.id);
                  }
                }}
                className={cn(
                  "flex items-start justify-between gap-3",
                  !isConnected && "text-muted-foreground opacity-60",
                )}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hostingLabel(provider.hosting)}
                    {provider.models[0] ? ` · ${provider.models[0]}` : ""}
                  </p>
                </div>
                {isActive && isConnected ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate(instructorSettingsPath("ai-models"))}
          className="gap-2"
        >
          <Settings2 className="size-4" aria-hidden="true" />
          Manage models in Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
