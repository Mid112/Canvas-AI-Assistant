import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";

interface RenderWithProvidersOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(
  ui: ReactElement,
  { routerProps, ...options }: RenderWithProvidersOptions = {},
) {
  return render(
    <AuthProvider>
      <MemoryRouter {...routerProps}>{ui}</MemoryRouter>
    </AuthProvider>,
    options,
  );
}
