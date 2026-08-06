// Context note: shares use institution state across route trees without prop-drilling.

import { useContext } from "react";

import { InstitutionContext } from "@/contexts/institution-context";

export function useInstitution() {
  const context = useContext(InstitutionContext);

  if (!context) {
    throw new Error("useInstitution must be used within an InstitutionProvider");
  }

  return context;
}
