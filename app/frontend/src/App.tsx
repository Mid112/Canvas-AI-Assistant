// File note: supports the app area of the Canvas workflow assistant.

import { RouterProvider } from "react-router-dom";

import { router } from "@/routes";

export default function App() {
  return <RouterProvider router={router} />;
}
