import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("RegisterHeader", () => {
  it("renders the Canvas Workflow Assistant brand", () => {
    renderWithRouter(<RegisterHeader />);

    expect(screen.getByText("Canvas Workflow Assistant")).toBeInTheDocument();
  });
});
