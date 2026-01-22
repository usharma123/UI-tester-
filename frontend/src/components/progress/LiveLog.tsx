import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";

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
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono font-semibold text-emerald-500 uppercase tracking-wider">
            Live
          </span>
        </div>
      </div>

      {/* Log entries */}
      <ScrollArea className="h-36 px-6 py-3 bg-background" ref={scrollRef}>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground font-mono">
            Waiting for events...
          </p>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex gap-4 font-mono text-xs animate-fade-in"
              >
                <span className="text-muted-foreground shrink-0">
                  {log.timestamp.toLocaleTimeString("en-US", { hour12: false })}
                </span>
                <span
                  className={cn(
                    "text-muted-foreground",
                    log.level === "warn" && "text-amber-500",
                    log.level === "error" && "text-red-500"
                  )}
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
