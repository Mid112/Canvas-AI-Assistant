// Component note: renders reusable brand logo UI for the instructor/admin experience.

import { GraduationCap } from "lucide-react";
import { Link } from "react-router-dom";

import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";

type BrandLogoVariant = "full" | "icon" | "wordmark";

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  to?: string;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  compact?: boolean;
  landing?: boolean;
  onClick?: () => void;
}

export function BrandLogo({
  variant = "full",
  to,
  className,
  iconClassName,
  wordmarkClassName,
  compact = false,
  landing = false,
  onClick,
}: BrandLogoProps) {
  const showIcon = variant === "full" || variant === "icon";
  const showWordmark = variant === "full" || variant === "wordmark";
  const label =
    landing ? BRAND.landingName
    : compact ? BRAND.shortName
    : BRAND.name;

  const content = (
    <>
      {showIcon ? (
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground",
            variant === "icon" ? "size-9" : "size-10",
            iconClassName,
          )}
        >
          <GraduationCap
            className={variant === "icon" ? "size-5" : "size-5"}
            aria-hidden="true"
          />
        </div>
      ) : null}
      {showWordmark ? (
        <div className={cn("min-w-0 leading-tight", wordmarkClassName)}>
          <span className="text-base font-semibold tracking-tight text-foreground md:text-lg">
            {label}
          </span>
          {variant === "full" && !compact && !landing ? (
            <p className="truncate text-xs text-muted-foreground">
              {BRAND.tagline}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const wrapperClass = cn(
    "inline-flex min-w-0 items-center gap-2.5",
    to && "transition-opacity hover:opacity-90",
    className,
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  return (
    <div className={wrapperClass} onClick={onClick} role={onClick ? "button" : undefined}>
      {content}
    </div>
  );
}

export function BrandLogoHomeLink({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <BrandLogo
      to={paths.home}
      onClick={onNavigate}
      className={className}
      compact
      wordmarkClassName="hidden sm:block"
      iconClassName="sm:size-9"
    />
  );
}
