import type { ReactNode } from "react";
import { cn } from "../../utils/helpers";

type Variant = "default" | "primary" | "success" | "warning" | "danger" | "info";

const VARIANTS: Record<Variant, string> = {
  default: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  primary: "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span className={cn("badge", VARIANTS[variant], className)}>{children}</span>
  );
}
