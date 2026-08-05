import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { isValidPassword } from "@/lib/validation";
import { PasswordInput } from "@/pages/Auth/PasswordInput";
import { passwordValidInputClassName } from "@/pages/Auth/PasswordMismatchAlert";
import { PasswordRequirementsChecklist } from "@/pages/Auth/PasswordRequirementsChecklist";
import {
  changeCurrentPassword,
  fetchSecurityStatus,
  fetchUserSessions,
  revokeUserSession,
} from "@/services/auth";
import type { SecurityStatusResponse, SessionResponse } from "@/types/auth";

function formatSessionTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SecuritySettingsTab() {
  const { accessToken } = useAuth();
  const [securityStatus, setSecurityStatus] =
    useState<SecurityStatusResponse | null>(null);
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const otherSessions = useMemo(
    () => sessions.filter((session) => !session.is_current),
    [sessions],
  );

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadSecurity() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [status, sessionRows] = await Promise.all([
          fetchSecurityStatus(token),
          fetchUserSessions(token),
        ]);

        if (cancelled) {
          return;
        }

        setSecurityStatus(status);
        setSessions(sessionRows);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load security settings.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSecurity();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const handlePasswordChange = async () => {
    if (!accessToken) {
      setErrorMessage("You need to sign in again before changing your password.");
      return;
    }

    if (!currentPassword || !newPassword) {
      setErrorMessage("Enter your current password and a new password.");
      setMessage(null);
      return;
    }

    if (!isValidPassword(newPassword)) {
      setErrorMessage(
        "New password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
      );
      setMessage(null);
      return;
    }

    setIsSavingPassword(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      await changeCurrentPassword(accessToken, {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update password.",
      );
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    if (!accessToken || otherSessions.length === 0) {
      return;
    }

    setIsRevoking(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      await Promise.all(
        otherSessions.map((session) => revokeUserSession(accessToken, session.id)),
      );
      const [status, sessionRows] = await Promise.all([
        fetchSecurityStatus(accessToken),
        fetchUserSessions(accessToken),
      ]);
      setSecurityStatus(status);
      setSessions(sessionRows);
      setMessage("Other sessions signed out.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to sign out other sessions.",
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      ) : null}

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Update your account password regularly to keep your account secure.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-invalid={newPassword !== "" && !isValidPassword(newPassword)}
                aria-describedby="settings-password-requirements"
                autoComplete="new-password"
                className={cn(
                  isValidPassword(newPassword) && passwordValidInputClassName,
                )}
              />
            </div>
          </div>
          <PasswordRequirementsChecklist
            id="settings-password-requirements"
            password={newPassword}
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              isSavingPassword ||
              !currentPassword ||
              !isValidPassword(newPassword)
            }
            onClick={() => void handlePasswordChange()}
          >
            {isSavingPassword ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add an extra layer of security to your account.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-amber-700">
            {securityStatus?.two_factor_enabled ? "2FA Enabled" : "2FA Not Enabled"}
          </p>
          <Button type="button" variant="outline" disabled>
            Enable 2FA
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Active Sessions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review devices currently signed in to your account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          ) : null}
          {sessions.map((session) => (
            <div key={session.id} className="rounded-lg border px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {session.is_current ? "Current Session" : "Signed-in Session"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Started {formatSessionTime(session.created_at)}
                  </p>
                </div>
                <span className="text-xs font-medium text-emerald-700">
                  {session.is_current ? "Active" : "Valid"}
                </span>
              </div>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            {securityStatus?.active_session_count ?? sessions.length} active
            session{(securityStatus?.active_session_count ?? sessions.length) === 1 ? "" : "s"}
          </p>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-destructive"
            disabled={isRevoking || otherSessions.length === 0}
            onClick={() => void handleRevokeOtherSessions()}
          >
            {isRevoking ? "Signing out..." : "Sign Out All Other Sessions"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
