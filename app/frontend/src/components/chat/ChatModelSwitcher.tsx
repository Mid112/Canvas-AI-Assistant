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
  LLM_PROVIDERS,
} from "@/data/llmProviders";
import { instructorSettingsPath } from "@/routes/paths";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

interface ChatModelSwitcherProps {
  settings: LlmProviderSettings;
  onProviderChange: (providerId: LlmProviderId) => void;
  disabled?: boolean;
}

export function ChatModelSwitcher({
  settings,
  onProviderChange,
  disabled = false,
}: ChatModelSwitcherProps) {
  const navigate = useNavigate();
  const selected = getLlmProviderOption(settings.provider);

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
          {LLM_PROVIDERS.map((provider) => {
            const isActive = provider.id === settings.provider;
            return (
              <DropdownMenuItem
                key={provider.id}
                onClick={() => onProviderChange(provider.id)}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {hostingLabel(provider.hosting)}
                    {provider.defaultModel ? ` · ${provider.defaultModel}` : ""}
                  </p>
                </div>
                {isActive ? (
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
