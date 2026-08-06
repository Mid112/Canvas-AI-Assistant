import { useState, type ComponentProps } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasConnectionEntry } from "@/components/canvas/CanvasConnectionEntry";
import {
  createCanvasConnectionEntry,
  getCanvasInstitutionLabel,
  isCanvasTokenValidationComplete,
  type CanvasConnectionEntryState,
} from "@/components/canvas/canvasConnectionEntryUtils";
import { validateCanvasToken } from "@/services/canvas";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/canvas", () => ({
  validateCanvasToken: vi.fn(),
}));

const mockedValidateCanvasToken = vi.mocked(validateCanvasToken);

function ControlledCanvasConnectionEntry(
  props: Omit<
    ComponentProps<typeof CanvasConnectionEntry>,
    "entry" | "onFieldChange"
  > & {
    initialEntry?: CanvasConnectionEntryState;
  },
) {
  const { initialEntry, onValidationChange, ...rest } = props;
  const [entry, setEntry] = useState(
    initialEntry ?? createCanvasConnectionEntry(),
  );

  return (
    <CanvasConnectionEntry
      {...rest}
      entry={entry}
      onFieldChange={(id, field, value) => {
        setEntry((current) =>
          current.id === id ? { ...current, [field]: value } : current,
        );
      }}
      onValidationChange={onValidationChange}
    />
  );
}

describe("CanvasConnectionEntry helpers", () => {
  it("labels the first institution without a number suffix", () => {
    expect(getCanvasInstitutionLabel(0)).toBe("Institution");
    expect(getCanvasInstitutionLabel(1)).toBe("Institution 2");
  });

  it("treats empty tokens as validation-complete", () => {
    expect(
      isCanvasTokenValidationComplete("", { status: "idle" }),
    ).toBe(true);
    expect(
      isCanvasTokenValidationComplete("token", { status: "valid" }),
    ).toBe(true);
    expect(
      isCanvasTokenValidationComplete("token", { status: "validating" }),
    ).toBe(false);
  });
});

describe("CanvasConnectionEntry", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockedValidateCanvasToken.mockResolvedValue("valid");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // Verifies: Renders institution fields and validates tokens.
  it("renders institution fields and validates tokens", async () => {
    const user = userEvent.setup();
    const onValidationChange = vi.fn();

    renderWithRouter(
      <ControlledCanvasConnectionEntry
        index={0}
        accessToken="access-token"
        onValidationChange={onValidationChange}
      />,
    );

    expect(screen.getByText("Institution")).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas API Token")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Canvas URL"),
      "https://canvas.university.edu",
    );
    await user.type(screen.getByLabelText("Canvas API Token"), "token-123");
    await vi.advanceTimersByTimeAsync(500);

    expect(await screen.findByText("Token is valid")).toBeInTheDocument();
    expect(mockedValidateCanvasToken).toHaveBeenCalledWith(
      "token-123",
      "access-token",
      "https://canvas.university.edu",
    );
  });

  // Verifies: Allows removing additional institution entries.
  it("allows removing additional institution entries", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    renderWithRouter(
      <ControlledCanvasConnectionEntry
        index={1}
        accessToken="access-token"
        canRemove
        onValidationChange={vi.fn()}
        onRemove={onRemove}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove institution 2" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
