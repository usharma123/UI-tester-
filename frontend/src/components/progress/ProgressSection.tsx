import { useAppStore } from "@/store/useAppStore";
import { useTimer } from "@/hooks/useTimer";
import { Card } from "@/components/ui/card";
import { PhaseTimeline } from "./PhaseTimeline";
import { LiveLog } from "./LiveLog";
import { SitemapTree } from "./SitemapTree";
import { Scan } from "lucide-react";

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function ProgressSection() {
  const status = useAppStore((s) => s.status);
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);

  // Start the timer
  useTimer();

  if (status !== "running") return null;

  return (
    <section className="mb-10 animate-slide-up">
      <Card className="overflow-hidden relative">
        {/* Animated scan line */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-foreground to-transparent animate-[scan_3s_linear_infinite]" />

        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-border/50 bg-gradient-to-b from-secondary/30 to-transparent">
          <div className="flex items-center gap-5">
            {/* Animated icon */}
            <div className="relative w-12 h-12 flex items-center justify-center bg-secondary rounded-lg border border-border">
              <Scan className="w-6 h-6 text-foreground animate-pulse" />
              <div className="absolute -right-1 -top-1 w-3 h-3 bg-foreground rounded-full animate-ping" />
            </div>
            <div>
              <h2 className="text-xl font-medium">Analysis in Progress</h2>
              <p className="text-sm text-muted-foreground">
                Testing UI functionality and accessibility
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="text-right">
            <span className="block text-3xl font-mono font-medium text-blue-400">
              {formatTime(elapsedSeconds)}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
              Elapsed
            </span>
          </div>
        </div>

        {/* Phase timeline */}
        <PhaseTimeline />

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
