// Page note: coordinates the profile page screen from smaller components and route-level data.

import { ProfileDeleteSection } from "@/pages/Profile/ProfileDeleteSection";
import { ProfileInformationSection } from "@/pages/Profile/ProfileInformationSection";
import { pageShellNarrow } from "@/lib/page-shell";

export function ProfilePage() {
  return (
    <div className={pageShellNarrow}>
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
