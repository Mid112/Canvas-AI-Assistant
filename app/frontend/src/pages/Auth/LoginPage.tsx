import { useNavigate } from "react-router-dom";

import { LoginFooter } from "@/pages/Auth/Login/LoginFooter";
import { LoginForm } from "@/pages/Auth/Login/LoginForm";
import { LoginHeader } from "@/pages/Auth/Login/LoginHeader";
import { LoginWelcome } from "@/pages/Auth/Login/LoginWelcome";
import { paths } from "@/routes/paths";

export function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 flex min-h-svh items-center justify-center bg-[#e8eef4] p-4 md:p-8">
      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <LoginHeader />
        <LoginWelcome />
        <LoginForm
          onSubmit={(e) => {
            e.preventDefault();
            navigate(paths.instructor.dashboard);
          }}
        />
        <LoginFooter />
      </div>
    </div>
  );
}
