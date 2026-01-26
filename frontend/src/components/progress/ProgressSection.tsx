import { useAppStore } from "@/store/useAppStore";
import { useTimer } from "@/hooks/useTimer";
import { Card } from "@/components/ui/card";
import { PhaseTimelineV2 } from "./PhaseTimelineV2";
import { LiveLog } from "./LiveLog";
import { SitemapTree } from "./SitemapTree";
import { Scan, Clock } from "lucide-react";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function ProgressSection() {
  const status = useAppStore((s) => s.status);
  const currentRunId = useAppStore((s) => s.currentRunId);
  const selectedHistoryId = useAppStore((s) => s.selectedHistoryId);
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);

  // Start the timer
  useTimer();

  // Show progress section if:
  // 1. Status is running AND (no history selected OR viewing the current run)
  const isViewingCurrentRun = !selectedHistoryId || selectedHistoryId === currentRunId;
  if (status !== "running" || !isViewingCurrentRun) return null;

  return (
    <section
      className="mb-10 animate-slide-up"
      role="region"
      aria-label="Test progress"
      aria-live="polite"
    >
      <Card className="overflow-hidden relative">
        {/* Animated scan line - decorative */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-foreground to-transparent animate-[scan_3s_linear_infinite]"
          aria-hidden="true"
        />

        {/* Header */}
        <header className="flex items-center justify-between px-8 py-6 border-b border-border/50 bg-gradient-to-b from-secondary/30 to-transparent">
          <div className="flex items-center gap-5">
            {/* Animated icon - decorative */}
            <div
              className="relative w-14 h-14 flex items-center justify-center bg-gradient-to-br from-foreground/5 to-foreground/10 rounded-xl border border-border shadow-sm"
              aria-hidden="true"
            >
              <Scan className="w-7 h-7 text-foreground animate-pulse" />
              <div className="absolute -right-1 -top-1 w-3.5 h-3.5 bg-emerald-500 rounded-full animate-pulse shadow-lg shadow-emerald-500/50" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Analysis in Progress</h2>
              <p className="text-sm text-muted-foreground">
                Testing UI functionality and accessibility
              </p>
            </div>
          </div>

          {/* Total elapsed timer - clearly labeled */}
          <div
            className="flex items-center gap-3 bg-secondary/50 rounded-xl px-5 py-3 border border-border/50"
            role="timer"
            aria-label={`Total elapsed time: ${formatTime(elapsedSeconds)}`}
          >
            <Clock className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            <div className="text-right">
              <span className="block text-2xl font-mono font-semibold tabular-nums">
                {formatTime(elapsedSeconds)}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
                Total Time
              </span>
            </div>
          </div>
        </header>

        {/* Phase timeline - V2 with improved state model */}
        <PhaseTimelineV2 />

        {/* Sitemap tree (if available) */}
        <SitemapTree />

        {/* Live log */}
        <LiveLog />
      </Card>

      <style>{`
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </section>
  );
}
