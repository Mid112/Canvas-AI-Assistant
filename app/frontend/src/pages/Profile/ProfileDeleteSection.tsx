import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/routes/paths";
import { deleteCurrentUser } from "@/services/auth";

export function ProfileDeleteSection() {
  const { accessToken, user, logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!user) {
    return null;
  }

  const handleDelete = async () => {
    if (!accessToken) {
      setErrorMessage("You need to sign in again before deleting your account.");
      return;
    }

    if (!password) {
      setErrorMessage("Enter your password to delete your account.");
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteCurrentUser(accessToken, password);
      logout();
      navigate(paths.home, {
        replace: true,
        state: { message: "Your account has been deleted." },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete your account. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/30 shadow-sm ring-1 ring-destructive/20">
      <CardHeader>
        <CardTitle className="text-destructive">Delete Profile</CardTitle>
        <p className="text-sm text-muted-foreground">
          Permanently deactivate this account, remove saved Canvas connections,
          and sign out of active sessions.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="delete-account-password">Confirm Password</Label>
          <Input
            id="delete-account-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </div>
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
