// Test note: covers the render with institution behavior so future changes can preserve the expected Canvas workflow contract.

import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, type MemoryRouterProps } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveCourseProvider } from "@/contexts/ActiveCourseProvider";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";

interface RenderWithInstitutionOptions extends RenderOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithInstitution(
  ui: ReactElement,
  { routerProps, ...options }: RenderWithInstitutionOptions = {},
) {
  // Wraps via the `wrapper` render option (rather than nesting `ui` directly
  // inside the providers) so that `rerender()` reapplies the same provider
  // tree instead of replacing it — a bare `rerender(<Component />)` would
  // otherwise unmount AuthProvider/InstitutionProvider/ActiveCourseProvider
  // along with it.
  return render(ui, {
    wrapper: ({ children }) => (
      <AuthProvider>
        <InstitutionProvider>
          <ActiveCourseProvider>
            <MemoryRouter {...routerProps}>{children}</MemoryRouter>
          </ActiveCourseProvider>
        </InstitutionProvider>
      </AuthProvider>
    ),
    ...options,
  });
}
