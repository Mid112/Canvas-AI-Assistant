// Page note: coordinates the profile information section screen from smaller components and route-level data.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { updateCurrentUser } from "@/services/auth";
import type { User } from "@/types/user";
import { getRoleLabel } from "@/utils/navigation";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function ProfileInformationForm({ user }: { user: User }) {
  const { accessToken, refreshUser } = useAuth();
  const initialName = splitName(user.name);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [email, setEmail] = useState(user.email);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
    const trimmedEmail = email.trim();

    if (!fullName) {
      setErrorMessage("First name is required.");
      setSavedMessage(null);
      return;
    }

    if (!accessToken) {
      setErrorMessage("You need to sign in again before updating your profile.");
      setSavedMessage(null);
      return;
    }

    if (!trimmedEmail) {
      setErrorMessage("Email address is required.");
      setSavedMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);

    try {
      await updateCurrentUser(accessToken, {
        name: fullName,
        email: trimmedEmail,
      });
      await refreshUser();
      setSavedMessage("Profile information saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save profile information. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <p className="text-sm text-muted-foreground">
          Update the account details stored with your profile.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
          <p className="font-medium">Account role</p>
          <p className="text-muted-foreground">{getRoleLabel(user.role)}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-first-name">First Name</Label>
            <Input
              id="profile-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-last-name">Last Name</Label>
            <Input
              id="profile-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-email">Email Address</Label>
          <Input
            id="profile-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        {savedMessage ? (
          <p role="status" className="text-sm text-emerald-700">
            {savedMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="border-t bg-transparent">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProfileInformationSection() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <ProfileInformationForm
      key={`${user.id}-${user.name}-${user.email}`}
      user={user}
    />
  );
}
