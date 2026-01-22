import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function Header() {
  const status = useAppStore((s) => s.status);

  return (
    <header className="flex items-center justify-between pb-8 mb-10 border-b border-border/50">
      <div className="flex items-center gap-5">
        {/* Logo */}
        <div className="relative w-14 h-14">
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Outer ring */}
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-muted-foreground/30 animate-[spin_35s_linear_infinite]"
              strokeDasharray="8 4"
            />
            {/* Inner ring */}
            <circle
              cx="50"
              cy="50"
              r="35"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-foreground/60"
            />
            {/* Core */}
            <circle cx="50" cy="50" r="8" className="fill-foreground" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-semibold tracking-tight">AXIOM</h1>
          <p className="text-sm text-muted-foreground tracking-widest uppercase">
            UI QA Laboratory
          </p>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-lg">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            status === "running"
              ? "bg-blue-400 animate-pulse"
              : "bg-emerald-400"
          )}
        />
        <span
          className={cn(
            "text-xs font-mono font-semibold tracking-wider",
            status === "running" ? "text-blue-400" : "text-emerald-400"
          )}
        >
          {status === "running" ? "SCANNING" : "SYSTEM READY"}
        </span>
      </div>
    </header>
  );
}
