import { useConvexAuth, useQuery } from "convex/react";
import { api } from "convex/_generated/api";
import { Link } from "react-router-dom";
import { AlertTriangle, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const LOW_BALANCE_THRESHOLD = 3;

export function LowBalanceWarning() {
  const { isAuthenticated } = useConvexAuth();
  const remainingRuns = useQuery(
    api.users.getRemainingRuns,
    isAuthenticated ? {} : "skip"
  );

  // Don't show if not authenticated, still loading, or has enough runs
  if (!isAuthenticated) return null;
  if (remainingRuns === undefined || remainingRuns === null) return null;
  if (remainingRuns >= LOW_BALANCE_THRESHOLD) return null;

  const isZero = remainingRuns === 0;

  return (
    <div
      className={`mb-6 rounded-lg p-4 flex items-center justify-between ${
        isZero
          ? "bg-destructive/10 border border-destructive/20"
          : "bg-amber-500/10 border border-amber-500/20"
      }`}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle
          className={`w-5 h-5 ${isZero ? "text-destructive" : "text-amber-500"}`}
        />
        <div>
          <p
            className={`text-sm font-medium ${
              isZero ? "text-destructive" : "text-amber-600 dark:text-amber-500"
            }`}
          >
            {isZero ? "No test runs remaining" : "Low balance warning"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isZero
              ? "Purchase more runs to continue testing"
              : `Only ${remainingRuns} run${remainingRuns === 1 ? "" : "s"} left`}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant={isZero ? "default" : "outline"}>
        <Link to="/pricing" className="gap-2">
          <Zap className="w-4 h-4" />
          Buy Runs
          <ArrowRight className="w-3 h-3" />
        </Link>
      </Button>
    </div>
  );
}
