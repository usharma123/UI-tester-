import { useState, type FormEvent } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { useClerk, useAuth } from "@clerk/clerk-react";
import { api } from "convex/_generated/api";
import { useAppStore } from "@/store/useAppStore";
import { useSSE } from "@/hooks/useSSE";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Globe, Play, Loader2, Settings2, LogIn, AlertCircle, Zap } from "lucide-react";
import { toast } from "sonner";

export function UrlForm() {
  const [url, setUrl] = useState("");
  const [goals, setGoals] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);

  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const remainingRuns = useQuery(
    api.users.getRemainingRuns,
    isAuthenticated ? {} : "skip"
  );

  const status = useAppStore((s) => s.status);
  const startRun = useAppStore((s) => s.startRun);
  const addToHistory = useAppStore((s) => s.addToHistory);
  const reset = useAppStore((s) => s.reset);
  const { connect } = useSSE();

  const isRunning = status === "running";
  const hasRuns = remainingRuns !== null && remainingRuns !== undefined && remainingRuns > 0;
  const canSubmit = isAuthenticated && hasRuns && !isRunning && url.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!isAuthenticated) {
      toast.error("Please sign in to run tests");
      return;
    }

    if (!hasRuns) {
      toast.error("No remaining runs. Please contact support for more.");
      return;
    }

    let processedUrl = url.trim();
    if (!processedUrl) return;

    // Auto-add https:// if missing
    if (!processedUrl.startsWith("http://") && !processedUrl.startsWith("https://")) {
      processedUrl = "https://" + processedUrl;
    }

    // Validate URL
    try {
      new URL(processedUrl);
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    // Reset UI
    reset();

    try {
      // Get Clerk token for Convex
      const token = await getToken({ template: "convex" });

      const response = await fetch("/api/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ url: processedUrl, goals: goals.trim() || undefined }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 401) {
          toast.error("Please sign in to run tests");
          return;
        }
        if (response.status === 403) {
          toast.error("No remaining runs");
          return;
        }
        throw new Error(error.error || "Failed to start test");
      }

      const { runId } = await response.json();

      // Start the run
      startRun(runId);

      // Add to history
      addToHistory({
        _id: runId,
        url: processedUrl,
        goals: goals.trim() || "homepage UX + primary CTA + form validation + keyboard",
        status: "running",
        startedAt: Date.now(),
      });

      // Connect to SSE
      connect(runId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start test");
    }
  };

  // Render sign-in prompt if not authenticated
  const renderAuthPrompt = () => {
    if (isAuthLoading) return null;
    if (isAuthenticated) return null;

    return (
      <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Sign in to start testing websites
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => openSignIn()}
          className="gap-2"
        >
          <LogIn className="w-4 h-4" />
          Sign In
        </Button>
      </div>
    );
  };

  // Render no runs warning
  const renderNoRunsWarning = () => {
    if (!isAuthenticated) return null;
    if (remainingRuns === undefined) return null; // Still loading
    if (hasRuns) return null;

    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-destructive" />
        <p className="text-sm text-destructive">
          You have no remaining test runs. Please contact support for more.
        </p>
      </div>
    );
  };

  return (
    <section className="mb-10">
      <form onSubmit={handleSubmit}>
        <div className="bg-card border border-border rounded-2xl p-8 relative overflow-hidden">
          {/* Accent line */}
          <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />

          {/* Label row */}
          <div className="flex items-baseline justify-between mb-5">
            <label htmlFor="url-input" className="text-xl font-semibold">
              Target URL
            </label>
            <div className="flex items-center gap-3">
              {isAuthenticated && remainingRuns !== undefined && (
                <Badge variant="secondary" className="gap-1.5 text-xs font-mono">
                  <Zap className="w-3 h-3" />
                  {remainingRuns} runs left
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                Enter any public website
              </span>
            </div>
          </div>

          {/* Input row */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                <Globe className="w-5 h-5" />
              </div>
              <Input
                id="url-input"
                type="text"
                placeholder="example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-12 h-12 bg-background border-border text-base"
                disabled={isRunning || !isAuthenticated}
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              className={`h-12 px-8 font-semibold transition-all ${
                isRunning
                  ? "bg-blue-600 hover:bg-blue-700"
                  : ""
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Scan
                </>
              )}
            </Button>
          </div>

          {/* Auth prompt or no runs warning */}
          {renderAuthPrompt()}
          {renderNoRunsWarning()}

          {/* Options panel */}
          {isAuthenticated && hasRuns && (
            <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
              <div className="bg-background border border-border/50 rounded-lg p-4 mt-4">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Test Goals
                    <span className="ml-auto text-[10px]">
                      {optionsOpen ? "▲" : "▼"}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <Input
                    type="text"
                    placeholder="homepage UX + primary CTA + form validation + keyboard"
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    className="bg-card border-border/50 text-sm"
                    disabled={isRunning}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Describe what you want to test. Leave empty for default comprehensive scan.
                  </p>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </div>
      </form>
    </section>
  );
}
