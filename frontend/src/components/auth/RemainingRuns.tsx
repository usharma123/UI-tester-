import { useQuery } from "convex/react";
import { useConvexAuth } from "convex/react";
import { api } from "convex/_generated/api";
import { Zap } from "lucide-react";

export function RemainingRuns() {
  const { isAuthenticated } = useConvexAuth();
  const remainingRuns = useQuery(
    api.users.getRemainingRuns,
    isAuthenticated ? {} : "skip"
  );

  if (!isAuthenticated) {
    return null;
  }

  if (remainingRuns === undefined) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-md">
        <Zap className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-mono text-muted-foreground">...</span>
      </div>
    );
  }

  const isLow = remainingRuns !== null && remainingRuns <= 1;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
        isLow ? "bg-destructive/10" : "bg-muted/50"
      }`}
    >
      <Zap
        className={`w-4 h-4 ${
          isLow ? "text-destructive" : "text-amber-500"
        }`}
      />
      <span
        className={`text-sm font-mono font-semibold ${
          isLow ? "text-destructive" : "text-foreground"
        }`}
      >
        {remainingRuns ?? 0}
      </span>
      <span className="text-xs text-muted-foreground">runs left</span>
    </div>
  );
}
