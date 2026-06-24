import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";

interface RenderWithInstitutionOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithInstitution(
  ui: ReactElement,
  { routerProps, ...options }: RenderWithInstitutionOptions = {},
) {
  return render(
    <AuthProvider>
      <InstitutionProvider>
        <MemoryRouter {...routerProps}>{ui}</MemoryRouter>
      </InstitutionProvider>
    </AuthProvider>,
    options,
  );
}
