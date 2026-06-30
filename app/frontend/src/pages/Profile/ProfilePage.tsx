import { ProfileDeleteSection } from "@/pages/Profile/ProfileDeleteSection";
import { ProfileInformationSection } from "@/pages/Profile/ProfileInformationSection";

export function ProfilePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Profile
        </h1>
        <p className="text-sm text-muted-foreground">
          View and manage your account details.
        </p>
      </header>

      <ProfileInformationSection />
      <ProfileDeleteSection />
    </div>
  );
}
