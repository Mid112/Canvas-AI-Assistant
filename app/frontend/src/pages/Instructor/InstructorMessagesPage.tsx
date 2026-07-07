import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import { StudentMessageDraftPage } from "@/pages/StudentMessageDraftPage";

export function InstructorMessagesPage() {
  const { user } = useAuth();

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <CanvasConnectionRequired description="Connect Canvas to draft messages for your course students." />
      </div>
    );
  }

  return <StudentMessageDraftPage />;
}
