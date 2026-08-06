// Admin UI note: presents instructor search controls for institution/admin workflows with service-backed state.

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

interface InstructorSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function InstructorSearch({ value, onChange }: InstructorSearchProps) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        aria-label="Search users"
        placeholder="Search users..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}
