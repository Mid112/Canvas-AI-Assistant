import { Link, Outlet } from "react-router-dom";
import { GraduationCap } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { paths } from "@/routes/paths";

export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/30 p-4 md:p-8">
      <Link
        to={paths.home}
        className="mb-8 flex items-center gap-2 text-lg font-semibold"
      >
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <GraduationCap className="size-5" />
        </div>
        Canvas Workflow Assistant
      </Link>
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Account access</CardTitle>
          <CardDescription>
            Sign in or register to manage Canvas workflows with natural language.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Outlet />
        </CardContent>
      </Card>
    </div>
  );
}
