// Instructor page note: coordinates late submissions section UI state with Canvas-backed services and active-course context.

import { Clock } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SubmissionStudent } from "@/types/submission";

import { SubmissionStudentCell } from "./SubmissionStudentCell";

interface LateSubmissionsSectionProps {
  students: SubmissionStudent[];
}

export function LateSubmissionsSection({
  students,
}: LateSubmissionsSectionProps) {
  const countLabel =
    students.length === 1
      ? "1 student submitted late"
      : `${students.length} students submitted late`;

  return (
    <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
      <CardHeader className="border-b border-amber-100 bg-amber-50/80 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Clock className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Late Submissions</h2>
            <p className="text-sm text-muted-foreground">{countLabel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {students.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No late submissions match your filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Student
                </TableHead>
                <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Submitted
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="px-4">
                    <SubmissionStudentCell student={student} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {student.email}
                  </TableCell>
                  <TableCell className="pr-4 font-medium text-amber-600">
                    {student.lateBy ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
