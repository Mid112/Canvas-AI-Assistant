import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

interface InstructorCoursesSearchProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function InstructorCoursesSearch({
  search,
  onSearchChange,
}: InstructorCoursesSearchProps) {
  return (
    <div className="relative max-w-xl">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        placeholder="Search courses..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="pl-8"
        aria-label="Search courses"
      />
    </div>
  );
}
