import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { pageShell } from "@/lib/page-shell";

export function InstructorNotificationsPage() {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();

  if (!user?.has_canvas_token) {
    return (
      <div className={pageShell}>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Notifications
          </h1>
          <p className="text-muted-foreground">
            Updates for {user?.name ?? "Instructor"} at{" "}
            {selectedInstitution.shortName}.
          </p>
        </div>
        <CanvasConnectionRequired description="Connect Canvas to receive course and submission notifications." />
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Notifications
        </h1>
        <p className="text-muted-foreground">
          Updates for {user?.name ?? "Instructor"} at{" "}
          {selectedInstitution.shortName}.
        </p>
      </div>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Recent notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No notifications yet. Course and submission alerts will appear here
            once available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
