import type {
  AssignmentCreateCourseOption,
} from "@/types/assignmentCreate";

export const assignmentCreateCourseOptions: AssignmentCreateCourseOption[] = [
  { id: "1", label: "CS 101: Introduction to Programming" },
  { id: "2", label: "CS 201: Data Structures" },
  { id: "3", label: "COSC 499: Capstone Project" },
];

export const assignmentCreateSuggestedPrompts = [
  {
    id: "python-quiz",
    text: "Create a quiz on Python functions and parameters",
  },
  {
    id: "web-api",
    text: "Design a project about web API integration",
  },
  {
    id: "recursion",
    text: "Generate a coding exercise on recursion",
  },
  {
    id: "database",
    text: "Make an assignment about database normalization",
  },
] as const;
