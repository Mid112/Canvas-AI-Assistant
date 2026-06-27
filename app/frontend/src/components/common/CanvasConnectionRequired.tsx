import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { instructorSettingsPath } from "@/routes/paths";

interface CanvasConnectionRequiredProps {
  title?: string;
  description?: string;
}

export function CanvasConnectionRequired({
  title = "Connect Canvas to continue",
  description = "Assignment features need a connected Canvas account. Connect your institution to load courses and assignments from Canvas.",
}: CanvasConnectionRequiredProps) {
  return (
    <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link to={instructorSettingsPath("canvas")} />}>
            Connect Canvas
          </Button>
          <Button variant="outline" render={<Link to={instructorSettingsPath("canvas")} />}>
            Open Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
