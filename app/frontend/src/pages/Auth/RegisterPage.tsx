import { useNavigate } from "react-router-dom";

import { RegisterFooter } from "@/pages/Auth/Register/RegisterFooter";
import { RegisterForm } from "@/pages/Auth/Register/RegisterForm";
import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";
import { RegisterWelcome } from "@/pages/Auth/Register/RegisterWelcome";
import { paths } from "@/routes/paths";

export function RegisterPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-[#e8eef4] p-4 md:p-8">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <RegisterHeader />
        <RegisterWelcome />
        <RegisterForm
          onSubmit={(e) => {
            e.preventDefault();
            navigate(paths.canvasInfo);
          }}
        />
        <RegisterFooter />
      </div>
    </div>
  );
}
