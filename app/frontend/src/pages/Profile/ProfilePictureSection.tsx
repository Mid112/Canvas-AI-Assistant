import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";

import { UserAvatar } from "@/components/common/UserAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { readAvatarDataUrl } from "@/lib/avatar-image";
import { updateCurrentUser } from "@/services/auth";
import type { User } from "@/types/user";

function ProfilePictureForm({ user }: { user: User }) {
  const { accessToken, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar_url ?? null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const persistAvatar = async (nextAvatarUrl: string | null) => {
    if (!accessToken) {
      setErrorMessage("You need to sign in again before updating your profile picture.");
      setStatusMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      await updateCurrentUser(accessToken, { avatar_url: nextAvatarUrl });
      await refreshUser();
      setAvatarUrl(nextAvatarUrl);
      setStatusMessage(
        nextAvatarUrl ? "Profile picture updated." : "Profile picture removed.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update profile picture. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const dataUrl = await readAvatarDataUrl(file);
      await persistAvatar(dataUrl);
    } catch (error) {
      setStatusMessage(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to process the selected image.",
      );
    }
  };

  const handleRemove = async () => {
    await persistAvatar(null);
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Profile Picture</CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload a photo for your account. It appears in the sidebar and across
          the app.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <UserAvatar
            name={user.name}
            avatarUrl={avatarUrl}
            className="size-24 text-2xl font-semibold"
            initialsClassName="text-2xl font-semibold"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus />
              {avatarUrl ? "Change photo" : "Upload photo"}
            </Button>
            {avatarUrl ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => void handleRemove()}
              >
                <Trash2 />
                Remove
              </Button>
            ) : null}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-label="Upload profile picture"
          onChange={(event) => void handleFileChange(event)}
        />

        <p className="text-xs text-muted-foreground">
          JPG, PNG, WebP, or GIF up to 5 MB.
        </p>

        {statusMessage ? (
          <p role="status" className="text-sm text-emerald-700">
            {statusMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ProfilePictureSection() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ProfilePictureForm
      key={`${user.id}-${user.avatar_url ?? "none"}`}
      user={user}
    />
  );
}
