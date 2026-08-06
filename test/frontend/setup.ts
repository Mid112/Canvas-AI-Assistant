// Test note: covers the setup behavior so future changes can preserve the expected Canvas workflow contract.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
});
