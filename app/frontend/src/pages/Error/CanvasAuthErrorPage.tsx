// Page note: coordinates the canvas auth error page screen from smaller components and route-level data.

import { useNavigate } from "react-router-dom";

import { AuthPageShell } from "@/components/layouts/AuthPageShell";
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
    <AuthPageShell>
      <CanvasAuthErrorHeader />
      <CanvasAuthErrorReasons />
      <CanvasAuthErrorActions
        onRetry={() => navigate(paths.canvasInfo)}
        onReturnToLogin={handleReturnToLogin}
      />
      <CanvasAuthErrorFooter />
    </AuthPageShell>
  );
}
