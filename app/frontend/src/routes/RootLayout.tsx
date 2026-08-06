// File note: supports the root layout area of the Canvas workflow assistant.

import { Outlet } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext";

export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
