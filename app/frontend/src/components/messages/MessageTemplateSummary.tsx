import { cn } from "@/lib/utils";
import type { MessageTemplate } from "@/types/messageDraft";

interface MessageTemplateSummaryProps {
  templates: MessageTemplate[];
  selectedTemplateId?: string;
  selectedTemplateName?: string;
  onSelectTemplate?: (templateId: string) => void;
  onDeleteTemplate?: (templateId: string) => void;
  onSaveCurrentAsTemplate?: () => void;
  isSavingTemplate?: boolean;
  emptyMessage?: string;
}

export function MessageTemplateSummary({
  templates,
  selectedTemplateId,
  selectedTemplateName,
  onSelectTemplate,
  onDeleteTemplate,
  onSaveCurrentAsTemplate,
  isSavingTemplate = false,
  emptyMessage = "No saved templates yet. Save the current message to create one.",
}: MessageTemplateSummaryProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm ring-1 ring-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Message Template</h2>
        {onSaveCurrentAsTemplate ? (
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            onClick={onSaveCurrentAsTemplate}
            disabled={isSavingTemplate}
          >
            {isSavingTemplate ? "Saving..." : "Save current"}
          </button>
        ) : null}
      </div>
      <div className="space-y-2 p-4">
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          templates.map((template) => {
            const isSelected =
              template.id === selectedTemplateId ||
              template.name === selectedTemplateName;

            return (
              <div
                key={template.id}
                className={cn(
                  "rounded-lg border px-3 py-2.5 transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                    : "border-border/60 bg-card opacity-70",
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full text-left",
                    onSelectTemplate && "hover:opacity-100",
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
                {onDeleteTemplate ? (
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-destructive underline-offset-4 hover:underline"
                    onClick={() => onDeleteTemplate(template.id)}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
