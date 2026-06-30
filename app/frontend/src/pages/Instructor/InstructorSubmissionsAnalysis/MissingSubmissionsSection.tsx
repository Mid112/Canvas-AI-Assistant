import { AlertCircle } from "lucide-react";

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

interface MissingSubmissionsSectionProps {
  students: SubmissionStudent[];
}

export function MissingSubmissionsSection({
  students,
}: MissingSubmissionsSectionProps) {
  const countLabel =
    students.length === 1
      ? "1 student has not submitted"
      : `${students.length} students have not submitted`;

  return (
    <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
      <CardHeader className="border-b border-red-100 bg-red-50/80 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <AlertCircle className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Missing Submissions</h2>
            <p className="text-sm text-muted-foreground">{countLabel}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {students.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No missing submissions match your filters.
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
                  Last Active
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
                  <TableCell className="pr-4 text-muted-foreground">
                    {student.lastActive ?? "—"}
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
