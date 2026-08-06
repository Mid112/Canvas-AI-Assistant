// Test note: covers the render with router behavior so future changes can preserve the expected Canvas workflow contract.

import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

interface RenderWithRouterOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithRouter(
  ui: ReactElement,
  { routerProps, ...options }: RenderWithRouterOptions = {},
) {
  return render(
    <MemoryRouter {...routerProps}>{ui}</MemoryRouter>,
    options,
  );
}
