// Component note: renders reusable placeholder page UI for the instructor/admin experience.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BRAND } from "@/lib/brand";

interface PlaceholderPageProps {
  title: string;
  description?: string;
  message?: string;
}

export function PlaceholderPage({
  title,
  description = "This section is under development.",
  message = "Coming soon",
}: PlaceholderPageProps) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>{title}</CardTitle>
            <Badge variant="secondary">{message}</Badge>
          </div>
          <CardDescription>
            {BRAND.name} will power this experience with secure, preview-first AI
            workflows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {message} — check back as features roll out.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
