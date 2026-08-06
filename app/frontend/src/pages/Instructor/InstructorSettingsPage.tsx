// Instructor page note: coordinates instructor settings page UI state with Canvas-backed services and active-course context.

import { useSearchParams } from "react-router-dom";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiModelsSettingsTab } from "@/pages/Instructor/InstructorSettings/AiModelsSettingsTab";
import { CanvasConnectionTab } from "@/pages/Instructor/InstructorSettings/CanvasConnectionTab";
import { NotificationSettingsTab } from "@/pages/Instructor/InstructorSettings/NotificationSettingsTab";
import { SecuritySettingsTab } from "@/pages/Instructor/InstructorSettings/SecuritySettingsTab";

const SETTINGS_TABS = ["canvas", "notifications", "security", "ai-models"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

function isSettingsTab(value: string | null): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

export function InstructorSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = isSettingsTab(requestedTab) ? requestedTab : "canvas";

  const handleTabChange = (value: string) => {
    if (!isSettingsTab(value)) {
      return;
    }

    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and preferences.
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value="canvas">Canvas Connection</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="ai-models">AI Models</TabsTrigger>
        </TabsList>

        <TabsContent value="canvas" className="mt-6">
          <CanvasConnectionTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-6">
          <NotificationSettingsTab />
        </TabsContent>
        <TabsContent value="security" className="mt-6">
          <SecuritySettingsTab />
        </TabsContent>
        <TabsContent value="ai-models" className="mt-6">
          <AiModelsSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
