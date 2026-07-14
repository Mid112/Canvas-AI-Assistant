import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAdminSettings,
  updateAdminSettings,
  type AdminSettings,
} from "@/services/adminSettings";
import { createAdmin } from "@/services/adminUsers";
import { pageShell, pageShellMedium } from "@/lib/page-shell";

const emptyAdminForm = { name: "", email: "", password: "" };

export function AdminSettingsPage() {
  const { accessToken } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [newAdmin, setNewAdmin] = useState(emptyAdminForm);
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [createAdminError, setCreateAdminError] = useState<string | null>(null);
  const [createAdminSuccess, setCreateAdminSuccess] = useState<string | null>(null);

  const canCreateAdmin =
    newAdmin.name.trim() !== "" &&
    newAdmin.email.trim() !== "" &&
    newAdmin.password.length >= 8;

  async function handleCreateAdmin() {
    if (!accessToken || !canCreateAdmin) {
      return;
    }

    setIsCreatingAdmin(true);
    setCreateAdminError(null);
    setCreateAdminSuccess(null);

    try {
      const created = await createAdmin(accessToken, {
        name: newAdmin.name.trim(),
        email: newAdmin.email.trim(),
        password: newAdmin.password,
      });
      setNewAdmin(emptyAdminForm);
      setCreateAdminSuccess(`${created.email} can now sign in as an administrator.`);
    } catch (error) {
      setCreateAdminError(
        error instanceof Error ? error.message : "Unable to create admin account.",
      );
    } finally {
      setIsCreatingAdmin(false);
    }
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchAdminSettings(accessToken);
        if (!cancelled) {
          setSettings(data);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load admin settings.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSave() {
    if (!accessToken || !settings) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateAdminSettings(accessToken, settings);
      setSettings(updated);
      setSuccessMessage("Settings saved successfully.");
    } catch {
      setSaveError("Unable to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className={pageShell}>
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className={pageShell}>
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className={pageShellMedium}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Admin Settings
        </h1>
        <p className="text-muted-foreground">
          Configure organization policies, integrations, and system defaults.
        </p>
      </header>

      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="organization-name">Organization name</Label>
            <Input
              id="organization-name"
              value={settings.organization_name}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? { ...current, organization_name: event.target.value }
                    : current,
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="self-registration">
                Allow instructor self-registration
              </Label>
              <p className="text-sm text-muted-foreground">
                Let instructors create accounts without admin approval.
              </p>
            </div>
            <input
              id="self-registration"
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={settings.allow_instructor_self_registration}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        allow_instructor_self_registration: event.target.checked,
                      }
                    : current,
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-timeout">Session timeout (minutes)</Label>
            <Input
              id="session-timeout"
              type="number"
              min={5}
              value={settings.session_timeout_minutes}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        session_timeout_minutes: Number(event.target.value) || 30,
                      }
                    : current,
                )
              }
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save settings"}
          </Button>
          {saveError ? (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          ) : null}
          {successMessage ? (
            <p className="text-sm text-emerald-600">{successMessage}</p>
          ) : null}
        </CardFooter>
      </Card>

      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Administrators</CardTitle>
          <p className="text-sm text-muted-foreground">
            Create another administrator account. Do this now for anyone who
            should have admin access if you're ever unable to sign in —
            there's no other way to recover admin access from within the
            product.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="new-admin-name">Name</Label>
            <Input
              id="new-admin-name"
              value={newAdmin.name}
              onChange={(event) =>
                setNewAdmin((current) => ({ ...current, name: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-admin-email">Email</Label>
            <Input
              id="new-admin-email"
              type="email"
              value={newAdmin.email}
              onChange={(event) =>
                setNewAdmin((current) => ({ ...current, email: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-admin-password">Temporary password</Label>
            <Input
              id="new-admin-password"
              type="password"
              autoComplete="new-password"
              value={newAdmin.password}
              onChange={(event) =>
                setNewAdmin((current) => ({ ...current, password: event.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Button
            type="button"
            onClick={() => void handleCreateAdmin()}
            disabled={!canCreateAdmin || isCreatingAdmin}
          >
            {isCreatingAdmin ? "Creating..." : "Create admin account"}
          </Button>
          {createAdminError ? (
            <p role="alert" className="text-sm text-destructive">
              {createAdminError}
            </p>
          ) : null}
          {createAdminSuccess ? (
            <p className="text-sm text-emerald-600">{createAdminSuccess}</p>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
