import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";

export function RunningBanner() {
  const status = useAppStore((s) => s.status);
  const currentRunId = useAppStore((s) => s.currentRunId);
  const selectedHistoryId = useAppStore((s) => s.selectedHistoryId);
  const selectHistory = useAppStore((s) => s.selectHistory);
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);

  // Only show if a test is running AND we're viewing something else
  const isViewingHistory = selectedHistoryId && selectedHistoryId !== currentRunId;
  if (status !== "running" || !isViewingHistory) return null;

  const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const secs = (elapsedSeconds % 60).toString().padStart(2, "0");

  return (
    <div className="mb-6 animate-slide-up">
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <div>
            <p className="text-sm font-medium text-blue-600">Test running in background</p>
            <p className="text-xs text-muted-foreground">
              Elapsed: {mins}:{secs}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => selectHistory(currentRunId)}
          className="gap-2 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
        >
          <ArrowLeft className="w-4 h-4" />
          View Progress
        </Button>
      </div>
    </div>
  );
}
