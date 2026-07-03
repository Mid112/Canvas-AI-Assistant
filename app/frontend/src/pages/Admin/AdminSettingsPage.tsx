import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function AdminSettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Admin Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure organization defaults and platform policies.
        </p>
      </header>

      <Tabs defaultValue="organization">
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="organization" className="space-y-4">
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader>
              <CardTitle>Canvas defaults</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Default Canvas host and institution branding settings will be
              configurable here once the admin settings API is available.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card className="shadow-sm ring-1 ring-border/60">
            <CardHeader>
              <CardTitle>Access policies</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Session timeout, password policy, and approval requirements will be
              managed from this tab in a future release.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
