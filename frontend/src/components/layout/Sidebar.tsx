import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSSE } from "@/hooks/useSSE";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Archive, FileText } from "lucide-react";
import type { RunStatus } from "@/lib/types";

function HistoryItem({
  run,
  isActive,
  onClick,
}: {
  run: RunStatus;
  isActive: boolean;
  onClick: () => void;
}) {
  const date = new Date(run.startedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  let hostname = "";
  try {
    hostname = new URL(run.url).hostname;
  } catch {
    hostname = run.url;
  }

  const scoreClass =
    run.score !== undefined
      ? run.score >= 80
        ? "text-emerald-400 bg-emerald-400/10"
        : run.score >= 50
          ? "text-amber-400 bg-amber-400/10"
          : "text-red-400 bg-red-400/10"
      : "";

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start h-auto py-3 px-3 mb-1 relative group",
        isActive && "bg-secondary"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-0 bg-foreground rounded-r transition-all",
          isActive && "h-8",
          "group-hover:h-6"
        )}
      />
      <div className="flex flex-col w-full gap-1">
        <span className="text-sm font-medium truncate text-left">{hostname}</span>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{date}</span>
          {run.status === "running" ? (
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-blue-400/10 text-blue-400 rounded border border-blue-400/20 animate-pulse">
              Active
            </span>
          ) : run.status === "failed" ? (
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wider bg-red-400/10 text-red-400 rounded border border-red-400/20">
              Failed
            </span>
          ) : run.score !== undefined ? (
            <span
              className={cn(
                "px-2 py-0.5 font-mono font-semibold rounded",
                scoreClass
              )}
            >
              {run.score}
            </span>
          ) : null}
        </div>
      </div>
    </Button>
  );
}

export function Sidebar() {
  const history = useAppStore((s) => s.history);
  const selectedHistoryId = useAppStore((s) => s.selectedHistoryId);
  const loadHistoryRun = useAppStore((s) => s.loadHistoryRun);
  const selectHistory = useAppStore((s) => s.selectHistory);
  const { loadHistory } = useSSE();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleHistoryClick = async (run: RunStatus) => {
    if (run.status === "running") return;

    try {
      const response = await fetch(`/api/runs/${run._id}`);
      if (response.ok) {
        const fullRun = await response.json();
        loadHistoryRun(fullRun);
        selectHistory(run._id);
      }
    } catch (err) {
      console.error("Failed to load run:", err);
    }
  };

  return (
    <aside className="w-72 p-5 shrink-0 sticky top-0 h-screen">
      <div className="h-full bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between bg-gradient-to-b from-secondary/30 to-transparent">
          <span className="text-[10px] font-mono font-semibold tracking-widest text-muted-foreground uppercase flex items-center gap-2">
            <Archive className="w-3 h-3" />
            Archive
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold">{history.length}</span>
            <span className="text-xs text-muted-foreground">scans</span>
          </div>
        </div>

        {/* History list */}
        <ScrollArea className="flex-1 p-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-sm font-medium text-muted-foreground">
                No scans yet
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Enter a URL to begin
              </p>
            </div>
          ) : (
            history.map((run) => (
              <HistoryItem
                key={run._id}
                run={run}
                isActive={selectedHistoryId === run._id}
                onClick={() => handleHistoryClick(run)}
              />
            ))
          )}
        </ScrollArea>
      </div>
    </aside>
  );
}
