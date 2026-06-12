import { useNavigate } from "react-router-dom";

import {
  CanvasAuthErrorActions,
  CanvasAuthErrorFooter,
} from "@/pages/Error/CanvasAuthError/CanvasAuthErrorActions";
import { CanvasAuthErrorHeader } from "@/pages/Error/CanvasAuthError/CanvasAuthErrorHeader";
import { CanvasAuthErrorReasons } from "@/pages/Error/CanvasAuthError/CanvasAuthErrorReasons";
import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/routes/paths";

export function CanvasAuthErrorPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleReturnToLogin = () => {
    logout();
    navigate(paths.login);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e8eef4]">
      <div className="flex min-h-svh items-center justify-center p-4 py-8 md:p-8">
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <CanvasAuthErrorHeader />
          <CanvasAuthErrorReasons />
          <CanvasAuthErrorActions
            onRetry={() => navigate(paths.canvasInfo)}
            onReturnToLogin={handleReturnToLogin}
          />
          <CanvasAuthErrorFooter />
        </div>
      </div>
    </div>
  );
}
