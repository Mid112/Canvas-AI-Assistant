// Instructor page note: coordinates instructor dashboard header UI state with Canvas-backed services and active-course context.

interface InstructorDashboardHeaderProps {
  userName: string;
  institutionShortName: string;
}

export function InstructorDashboardHeader({
  userName,
  institutionShortName,
}: InstructorDashboardHeaderProps) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
        Dashboard
      </h1>
      <p className="text-muted-foreground">
        Welcome back, {userName}. Overview for {institutionShortName}.
      </p>
    </div>
  );
}
