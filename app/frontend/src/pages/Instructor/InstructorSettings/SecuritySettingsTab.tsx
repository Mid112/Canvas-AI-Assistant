import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SecuritySettingsTab() {
  return (
    <div className="space-y-6">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Update your account password regularly to keep your account secure.
          </p>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline">
            Change Password
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your account.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-amber-700">2FA Not Enabled</p>
          <Button type="button" variant="outline">
            Enable 2FA
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review devices currently signed in to your account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Current Session</p>
                <p className="text-sm text-muted-foreground">
                  Browser session on this device
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-700">Active</span>
            </div>
          </div>
          <Button type="button" variant="link" className="h-auto p-0 text-destructive">
            Sign Out All Other Sessions
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
