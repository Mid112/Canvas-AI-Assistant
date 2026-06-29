import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { deleteProfileLocally } from "@/lib/profile-storage";
import { paths } from "@/routes/paths";

export function ProfileDeleteSection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      deleteProfileLocally(user.id);
      logout();
      navigate(paths.home, {
        replace: true,
        state: { message: "Your profile has been removed. Sign up from the home page to create a new account." },
      });
    } catch {
      setErrorMessage("Unable to delete your profile. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/30 shadow-sm ring-1 ring-destructive/20">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Profile</CardTitle>
        <p className="text-sm text-muted-foreground">
          Remove your saved profile details from this device and sign out. You
          will be redirected to the home page to sign up again.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          disabled={isDeleting}
          onClick={() => void handleDelete()}
        >
          {isDeleting ? "Deleting..." : "Delete profile"}
        </Button>
      </CardContent>
    </Card>
  );
}
