// Admin UI note: presents search combobox controls for institution/admin workflows with service-backed state.

import type { LucideIcon } from "lucide-react";
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

interface SearchComboboxProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  allOptionLabel: string;
  emptyMessage: string;
  listboxLabel: string;
  icon?: LucideIcon;
  className?: string;
}

function filterOptions(options: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) =>
    option.toLowerCase().includes(normalizedQuery),
  );
}

export function SearchCombobox({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  allOptionLabel,
  emptyMessage,
  listboxLabel,
  icon: Icon,
  className,
}: SearchComboboxProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filteredOptions = useMemo(
    () => filterOptions(options, query),
    [options, query],
  );

  const inputValue = isOpen ? query : value;
  const activeOptionId =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(value);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [value]);

  function selectOption(option: string) {
    onChange(option);
    setQuery(option);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function openDropdown() {
    setIsOpen(true);
    setQuery(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const dropdownOptions = filteredOptions;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
          setActiveIndex(dropdownOptions.length > 0 ? 0 : -1);
          return;
        }
        setActiveIndex((current) =>
          dropdownOptions.length === 0
            ? -1
            : Math.min(current < 0 ? 0 : current + 1, dropdownOptions.length - 1),
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) {
          openDropdown();
          setActiveIndex(
            dropdownOptions.length > 0 ? dropdownOptions.length - 1 : -1,
          );
          return;
        }
        setActiveIndex((current) =>
          dropdownOptions.length === 0 ? -1 : Math.max(current - 1, 0),
        );
        break;
      case "Enter":
        if (isOpen && activeIndex >= 0 && dropdownOptions[activeIndex]) {
          event.preventDefault();
          selectOption(dropdownOptions[activeIndex]!);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        setQuery(value);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  }

  return (
    <div ref={containerRef} className={cn("relative min-w-0", className)}>
      {Icon ? (
        <Icon
          className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      <Input
        type="search"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={inputValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          setQuery(nextValue);
          onChange(nextValue);
          setIsOpen(true);
          setActiveIndex(0);
        }}
        onFocus={openDropdown}
        onKeyDown={handleKeyDown}
        className={Icon ? "pl-8" : undefined}
      />

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={listboxLabel}
          className="absolute z-20 mt-1 max-h-56 w-full min-w-[12rem] overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          <li role="option" aria-selected={value === ""}>
            <button
              type="button"
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted",
                value === "" && "bg-muted font-medium text-foreground",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption("")}
            >
              {allOptionLabel}
            </button>
          </li>

          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {emptyMessage}
            </li>
          ) : (
            filteredOptions.map((option, index) => (
              <li
                key={option}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={option === value}
              >
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                    (option === value || index === activeIndex) &&
                      "bg-muted font-medium",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
