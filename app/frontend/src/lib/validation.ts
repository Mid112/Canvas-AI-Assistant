// Frontend helper note: centralizes validation behavior so components and tests share one implementation.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordRequirementId =
  | "length"
  | "uppercase"
  | "lowercase"
  | "number"
  | "symbol";

export interface PasswordRequirement {
  id: PasswordRequirementId;
  label: string;
  met: boolean;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Live checklist state for password strength (#1451). */
export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: "At least 8 characters",
      met: password.length >= MIN_PASSWORD_LENGTH,
    },
    {
      id: "uppercase",
      label: "1 uppercase letter",
      met: /[A-Z]/.test(password),
    },
    {
      id: "lowercase",
      label: "1 lowercase letter",
      met: /[a-z]/.test(password),
    },
    {
      id: "number",
      label: "1 number",
      met: /\d/.test(password),
    },
    {
      id: "symbol",
      label: "1 symbol",
      met: /[^A-Za-z0-9\s]/.test(password),
    },
  ];
}

export function isValidPassword(password: string): boolean {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}
