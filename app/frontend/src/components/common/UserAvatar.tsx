import { getInitials } from "@/lib/user-display";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  className?: string;
  initialsClassName?: string;
}

export function UserAvatar({
  name,
  avatarUrl,
  className,
  initialsClassName,
}: UserAvatarProps) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-medium text-primary",
        className,
      )}
      aria-label={`${name} avatar`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="size-full object-cover"
          aria-hidden="true"
        />
      ) : (
        <span className={initialsClassName}>{getInitials(name)}</span>
      )}
    </div>
  );
}
