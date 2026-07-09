import { readFileSync, existsSync } from "node:fs";

function readJson(path) {
  if (!path || !existsSync(path)) {
    return null;
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function formatFrontend(summary) {
  if (!summary?.total) {
    return "| Metric | Coverage |\n| --- | --- |\n| Status | Not run |";
  }

  const { lines, statements, branches, functions } = summary.total;
  return [
    "| Metric | Coverage |",
    "| --- | --- |",
    `| Lines | ${lines.pct}% |`,
    `| Statements | ${statements.pct}% |`,
    `| Branches | ${branches.pct}% |`,
    `| Functions | ${functions.pct}% |`,
  ].join("\n");
}

function formatBackend(coverage) {
  if (!coverage?.totals) {
    return "| Metric | Coverage |\n| --- | --- |\n| Status | Not run |";
  }

  const percent = coverage.totals.percent_covered.toFixed(2);
  const lines = coverage.totals.num_statements;
  const covered = coverage.totals.covered_lines;

  return [
    "| Metric | Coverage |",
    "| --- | --- |",
    `| Lines | ${percent}% (${covered}/${lines}) |`,
  ].join("\n");
}

const frontend = readJson(process.argv[2]);
const backend = readJson(process.argv[3]);
const frontendPassed = process.argv[4] === "true";
const backendPassed = process.argv[5] === "true";

const sections = [
  "## Coverage report",
  "",
  "This comment is updated on each push. Thresholds are enforced when running coverage locally:",
  "- Frontend: `cd app/frontend && npm run test:coverage`",
  "- Backend: `cd app/backend && source .venv/bin/activate && PYTHONPATH=. DATABASE_URL=... pytest ../../test/backend/ --cov=. --cov-report=term-missing`",
  "",
  "### Frontend",
  frontendPassed ? "Status: passed" : "Status: failed or skipped",
  "",
  formatFrontend(frontend),
  "",
  "### Backend",
  backendPassed ? "Status: passed" : "Status: failed or skipped",
  "",
  formatBackend(backend),
];

process.stdout.write(sections.join("\n"));
