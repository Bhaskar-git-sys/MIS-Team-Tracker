import { getInitials } from "../../utils/helpers";
import { cn } from "../../utils/helpers";
import { PRESENCE_COLORS } from "../../utils/constants";
import type { PresenceStatus } from "../../types";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  presence?: PresenceStatus | null;
  className?: string;
}

const SIZES = {
  xs: "w-6 h-6 text-xs",
  sm: "w-8 h-8 text-sm",
  md: "w-10 h-10 text-base",
  lg: "w-12 h-12 text-lg",
  xl: "w-20 h-20 text-3xl",
};

const DOT_SIZES = {
  xs: "w-2 h-2",
  sm: "w-2.5 h-2.5",
  md: "w-3 h-3",
  lg: "w-3.5 h-3.5",
  xl: "w-5 h-5",
};

export function Avatar({ name, src, size = "md", presence, className }: AvatarProps) {
  return (
    <div className={cn("relative flex-shrink-0", className)}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${SIZES[size]} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${SIZES[size]} rounded-full bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center text-white font-semibold`}
        >
          {getInitials(name)}
        </div>
      )}
      {presence && (
        <span
          className={`absolute bottom-0 right-0 ${DOT_SIZES[size]} ${PRESENCE_COLORS[presence]} rounded-full border-2 border-white dark:border-slate-800`}
        />
      )}
    </div>
  );
}
