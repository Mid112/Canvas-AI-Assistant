import { useNavigate } from "react-router-dom";

import { ReviewPermissionsActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsActions";
import { ReviewPermissionsAllowedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsAllowedActions";
import { ReviewPermissionsHeader } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsHeader";
import { ReviewPermissionsNote } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsNote";
import { ReviewPermissionsRestrictedActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsRestrictedActions";
import { paths } from "@/routes/paths";

export function ReviewPermissionsPage() {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#e8eef4]">
      <div className="flex min-h-svh items-center justify-center p-4 py-8 md:p-8">
        <div className="w-full max-w-lg rounded-2xl bg-white px-8 py-10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
          <ReviewPermissionsHeader />
          <ReviewPermissionsAllowedActions />
          <ReviewPermissionsRestrictedActions />
          <ReviewPermissionsNote />
          <ReviewPermissionsActions
            onCancel={() => navigate(paths.canvasInfo)}
            onApprove={() => navigate(paths.instructor.dashboard)}
          />
        </div>
      </div>
    </div>
  );
}
