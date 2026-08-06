// Instructor page note: coordinates assignment search select UI state with Canvas-backed services and active-course context.

import { Search } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AssignmentSubmissionAnalysis } from "@/types/submission";

import { filterSubmissionAssignments } from "./submissionUtils";

interface AssignmentSearchSelectProps {
  assignments: AssignmentSubmissionAnalysis[];
  selectedAssignmentId: string;
  onAssignmentChange: (assignmentId: string) => void;
}

export function AssignmentSearchSelect({
  assignments,
  selectedAssignmentId,
  onAssignmentChange,
}: AssignmentSearchSelectProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedAssignmentId),
    [assignments, selectedAssignmentId],
  );

  const filteredAssignments = useMemo(
    () => filterSubmissionAssignments(assignments, query),
    [assignments, query],
  );

  const inputValue = isOpen ? query : (selectedAssignment?.label ?? "");
  const activeOptionId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedAssignment?.label ?? "");
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [selectedAssignment?.label]);

  function selectAssignment(assignment: AssignmentSubmissionAnalysis) {
    onAssignmentChange(assignment.id);
    setQuery(assignment.label);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function openDropdown() {
    setIsOpen(true);
    setQuery(selectedAssignment?.label ?? "");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (assignments.length === 0) {
      return;
    }

    const options = filteredAssignments;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
          setActiveIndex(options.length > 0 ? 0 : -1);
          return;
        }
        setActiveIndex((current) =>
          options.length === 0
            ? -1
            : Math.min(current < 0 ? 0 : current + 1, options.length - 1),
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
          setActiveIndex(options.length > 0 ? options.length - 1 : -1);
          return;
        }
        setActiveIndex((current) =>
          options.length === 0 ? -1 : Math.max(current - 1, 0),
        );
        break;
      case "Enter":
        if (isOpen && activeIndex >= 0 && options[activeIndex]) {
          event.preventDefault();
          selectAssignment(options[activeIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        setQuery(selectedAssignment?.label ?? "");
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className="relative space-y-1.5">
      <label
        htmlFor="assignment-search-select"
        className="text-sm font-medium text-foreground"
      >
        Assignment
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="assignment-search-select"
          type="search"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          placeholder="Search or select assignment..."
          value={inputValue}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={openDropdown}
          onKeyDown={handleKeyDown}
          className="pl-8"
          aria-label="Search or select assignment"
          disabled={assignments.length === 0}
        />
      </div>

      {isOpen && assignments.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Assignments"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {filteredAssignments.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No assignments match your search.
            </li>
          ) : (
            filteredAssignments.map((assignment, index) => (
              <li
                key={assignment.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={assignment.id === selectedAssignmentId}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    (assignment.id === selectedAssignmentId ||
                      index === activeIndex) &&
                      "bg-muted font-medium",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectAssignment(assignment)}
                >
                  {assignment.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
