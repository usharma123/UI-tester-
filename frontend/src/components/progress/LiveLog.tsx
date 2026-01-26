import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Terminal, Info, AlertTriangle, XCircle } from "lucide-react";

const levelIcons = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
};

export function LiveLog() {
  const logs = useAppStore((s) => s.logs);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="border-t border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-b from-secondary/30 to-transparent">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span className="font-medium">Activity Log</span>
          <span className="text-xs text-muted-foreground/60">
            ({logs.length} events)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono font-semibold text-emerald-500 uppercase tracking-wider">
            Live
          </span>
        </div>
      </div>

      {/* Log entries */}
      <ScrollArea className="h-44 px-6 py-3 bg-background/50" ref={scrollRef}>
        {logs.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
            <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
            Waiting for events...
          </div>
        ) : (
          <div className="space-y-1.5">
            {logs.map((log) => {
              const Icon = levelIcons[log.level];
              return (
                <div
                  key={log.id}
                  className={cn(
                    "flex items-start gap-3 font-mono text-xs animate-fade-in py-1 px-2 rounded-md transition-colors",
                    log.level === "warn" && "bg-amber-500/5",
                    log.level === "error" && "bg-red-500/5"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-3.5 h-3.5 mt-0.5 shrink-0",
                      log.level === "info" && "text-muted-foreground/60",
                      log.level === "warn" && "text-amber-500",
                      log.level === "error" && "text-red-500"
                    )}
                  />
                  <span className="text-muted-foreground/60 shrink-0 tabular-nums">
                    {log.timestamp.toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                  <span
                    className={cn(
                      "flex-1",
                      log.level === "info" && "text-foreground/80",
                      log.level === "warn" && "text-amber-600",
                      log.level === "error" && "text-red-600"
                    )}
                  >
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
