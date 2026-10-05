interface LogoProps {
  size?: number;
  showText?: boolean;
  variant?: "full" | "icon";
}

export function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <img
      width={size}
      height={size}
      src={`${import.meta.env.BASE_URL}favicon.svg`}
      alt="Kalyani Motors logo"
      className="shrink-0"
    />
  );
}

export default function Logo({ size = 40, showText = true, variant = "full" }: LogoProps) {
  if (variant === "icon" || !showText) {
    return <LogoIcon size={size} />;
  }

  return (
    <div className="flex items-center gap-3">
      <LogoIcon size={size} />
      <div className="flex flex-col leading-tight">
        <span
          className="font-bold tracking-tight text-slate-900 dark:text-white"
          style={{ fontSize: size * 0.36 }}
        >
          Kalyani Motors
        </span>
        <span
          className="font-medium tracking-wide text-blue-600 dark:text-blue-400"
          style={{ fontSize: size * 0.26 }}
        >
          MIS Team Tracker
        </span>
      </div>
    </div>
  );
}
