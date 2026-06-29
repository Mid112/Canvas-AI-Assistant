import { cn } from "@/lib/utils";
import { mockMessageTemplates } from "@/data/mockMessageDraft";

interface MessageTemplateSummaryProps {
  selectedTemplateId?: string;
  selectedTemplateName?: string;
}

export function MessageTemplateSummary({
  selectedTemplateId,
  selectedTemplateName,
}: MessageTemplateSummaryProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-white shadow-sm ring-1 ring-border/60">
      <div className="border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Message Template</h2>
      </div>
      <div className="space-y-2 p-4">
        {mockMessageTemplates.map((template) => {
          const isSelected =
            template.id === selectedTemplateId ||
            template.name === selectedTemplateName;

          return (
            <div
              key={template.id}
              className={cn(
                "rounded-lg border px-3 py-2.5 transition-colors",
                isSelected
                  ? "border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/20"
                  : "border-border/60 bg-white opacity-70",
              )}
              aria-current={isSelected ? "true" : undefined}
            >
              <p
                className={cn(
                  "text-sm font-medium",
                  isSelected ? "text-blue-700" : "text-foreground",
                )}
              >
                {template.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {template.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
