import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  getStoredProfileDraft,
  saveProfileDraft,
} from "@/lib/profile-storage";
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

export function ProfileInformationSection() {
  const { user } = useAuth();
  const storedDraft = useMemo(
    () => (user ? getStoredProfileDraft(user.id) : null),
    [user],
  );
  const initialName = useMemo(
    () => splitName(storedDraft?.name ?? user?.name ?? ""),
    [storedDraft?.name, user?.name],
  );
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [department, setDepartment] = useState(storedDraft?.department ?? "");
  const [title, setTitle] = useState(storedDraft?.title ?? "");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFirstName(initialName.firstName);
    setLastName(initialName.lastName);
    setDepartment(storedDraft?.department ?? "");
    setTitle(storedDraft?.title ?? "");
  }, [initialName.firstName, initialName.lastName, storedDraft]);

  if (!user) {
    return null;
  }

  const handleSave = async () => {
    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

    if (!fullName) {
      setErrorMessage("First name is required.");
      setSavedMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);

    try {
      await saveProfileDraft(user.id, {
        name: fullName,
        department: department.trim(),
        title: title.trim(),
      });
      setSavedMessage("Profile information saved.");
    } catch {
      setErrorMessage("Unable to save profile information. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <p className="text-sm text-muted-foreground">
          Update your personal details and professional information.
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
          <Input id="profile-email" type="email" value={user.email} readOnly />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-department">Department</Label>
            <Input
              id="profile-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Computer Science"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-title">Title</Label>
            <Input
              id="profile-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Professor"
            />
          </div>
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
