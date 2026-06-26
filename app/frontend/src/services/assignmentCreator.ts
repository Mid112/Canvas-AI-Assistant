import type { GeneratedAssignmentDraft } from "@/types/assignmentCreate";

export class AssignmentCreatorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentCreatorApiError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function randomDelayMs(): number {
  return 1200 + Math.floor(Math.random() * 800);
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(23, 59, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function buildMockDraft(prompt: string): GeneratedAssignmentDraft {
  const normalized = prompt.toLowerCase();

  if (normalized.includes("quiz") || normalized.includes("python")) {
    return {
      name: "Python Functions Quiz",
      description:
        "Complete a short quiz covering function definitions, parameters, default arguments, and return values. Include 5 multiple-choice and 2 short-answer questions.",
      dueDate: defaultDueDate(),
      pointsPossible: 50,
    };
  }

  if (normalized.includes("api") || normalized.includes("web")) {
    return {
      name: "Web API Integration Project",
      description:
        "Build a small client that consumes a public REST API, handles pagination, and displays results in a structured report. Submit code and a brief README.",
      dueDate: defaultDueDate(),
      pointsPossible: 100,
    };
  }

  if (normalized.includes("recursion")) {
    return {
      name: "Recursion Practice Set",
      description:
        "Solve three recursion problems: factorial, tree traversal, and a backtracking puzzle. Include time complexity analysis for each solution.",
      dueDate: defaultDueDate(),
      pointsPossible: 75,
    };
  }

  if (normalized.includes("database") || normalized.includes("normalization")) {
    return {
      name: "Database Normalization Exercise",
      description:
        "Given an unnormalized schema, produce 3NF tables, document functional dependencies, and explain each normalization step.",
      dueDate: defaultDueDate(),
      pointsPossible: 60,
    };
  }

  return {
    name: "Programming Assignment",
    description: `Based on your prompt: ${prompt.trim()}\n\nStudents should demonstrate understanding of the requested topics, submit working code, and include a short reflection on their approach.`,
    dueDate: defaultDueDate(),
    pointsPossible: 100,
  };
}

/** Mock AI assignment generation — simulates network delay. */
export async function generateAssignmentDraft(
  prompt: string,
): Promise<GeneratedAssignmentDraft> {
  await delay(randomDelayMs());

  if (prompt.toLowerCase().includes("fail")) {
    throw new AssignmentCreatorApiError(
      "The assignment generator is temporarily unavailable. Please try again.",
    );
  }

  return buildMockDraft(prompt);
}

/** Mock approve/create — simulates saving to Canvas. */
export async function approveAssignmentDraft(): Promise<void> {
  await delay(800);
}
