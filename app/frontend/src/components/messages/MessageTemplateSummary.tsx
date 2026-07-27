import { cn } from "@/lib/utils";
import { mockMessageTemplates } from "@/data/mockMessageDraft";

interface MessageTemplateSummaryProps {
  selectedTemplateId?: string;
  selectedTemplateName?: string;
  onSelectTemplate?: (templateId: string) => void;
}

export function MessageTemplateSummary({
  selectedTemplateId,
  selectedTemplateName,
  onSelectTemplate,
}: MessageTemplateSummaryProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm ring-1 ring-border/60">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Message Template</h2>
      </div>
      <div className="space-y-2 p-4">
        {mockMessageTemplates.map((template) => {
          const isSelected =
            template.id === selectedTemplateId ||
            template.name === selectedTemplateName;

          return (
            <button
              type="button"
              key={template.id}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                  : "border-border/60 bg-card opacity-70",
                onSelectTemplate && "hover:border-primary/60 hover:opacity-100",
              )}
              aria-current={isSelected ? "true" : undefined}
              onClick={() => onSelectTemplate?.(template.id)}
            >
              <p
                className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-primary" : "text-foreground",
                )}
              >
                {template.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {template.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
