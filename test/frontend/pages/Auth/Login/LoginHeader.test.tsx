import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginHeader } from "@/pages/Auth/Login/LoginHeader";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("LoginHeader", () => {
  it("renders the Canvas Workflow Assistant brand", () => {
    renderWithRouter(<LoginHeader />);

    expect(screen.getByText("Canvas Workflow Assistant")).toBeInTheDocument();
  });
});
