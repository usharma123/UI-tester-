import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { useAppStore } from "@/store/useAppStore";
import type { SSEEvent } from "@/lib/types";

const MAX_RETRIES = 3;

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const { getToken } = useAuth();

  const {
    currentRunId,
    addLog,
    setPhaseActive,
    setPhaseComplete,
    addScreenshot,
    setSitemap,
    setPlanCreated,
    setStepProgress,
    setComplete,
    setError,
    updateHistoryItem,
    setHistory,
  } = useAppStore();

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case "connected":
          addLog("info", "Connection established");
          retryCountRef.current = 0;
          break;

        case "phase_start":
          setPhaseActive(event.phase);
          break;

        case "phase_complete":
          setPhaseComplete(event.phase);
          break;

        case "screenshot":
          addScreenshot({
            url: event.url,
            label: event.label,
            stepIndex: event.stepIndex,
          });
          addLog("info", `Captured: ${event.label}`);
          break;

        case "sitemap":
          setSitemap(event.urls, event.source, event.totalPages);
          addLog("info", `Discovered ${event.totalPages} pages via ${event.source}`);
          break;

        case "plan_created":
          setPlanCreated(event.totalSteps);
          addLog("info", `Test plan generated: ${event.totalSteps} steps`);
          break;

        case "step_start":
          setStepProgress(event.stepIndex + 1, event.totalSteps);
          addLog(
            "info",
            `Step ${event.stepIndex + 1}: ${event.step.type}${
              event.step.note ? ` - ${event.step.note}` : ""
            }`
          );
          break;

        case "step_complete":
          if (event.status === "success") {
            addLog("info", `Step ${event.stepIndex + 1} complete`);
          } else if (event.status === "failed") {
            addLog("warn", `Step ${event.stepIndex + 1} failed: ${event.error}`);
          } else if (event.status === "blocked") {
            addLog("error", `Step ${event.stepIndex + 1} blocked: ${event.error}`);
          }
          break;

        case "complete":
          setComplete(event.report);
          if (currentRunId) {
            updateHistoryItem(currentRunId, {
              status: "completed",
              score: event.report.score,
            });
          }
          // Refresh history
          loadHistory();
          break;

        case "error":
          setError(event.message);
          if (currentRunId) {
            updateHistoryItem(currentRunId, { status: "failed" });
          }
          break;

        case "log":
          addLog(event.level, event.message);
          break;

        // Page-level progress for traversal phase
        case "page_start":
          // Update progress using page index (bounded)
          setStepProgress(event.pageIndex + 1, event.totalPages);
          addLog("info", `Testing page ${event.pageIndex + 1}/${event.totalPages}: ${event.url}`);
          break;

        case "page_complete":
          addLog(
            event.status === "success" ? "info" : "warn",
            `Page ${event.pageIndex + 1} ${event.status}`
          );
          break;

        case "pages_progress":
          // Update step progress with bounded values
          setStepProgress(event.tested + event.skipped, event.total);
          break;
      }
    },
    [
      addLog,
      setPhaseActive,
      setPhaseComplete,
      addScreenshot,
      setSitemap,
      setPlanCreated,
      setStepProgress,
      setComplete,
      setError,
      currentRunId,
      updateHistoryItem,
    ]
  );

  const connect = useCallback(
    (runId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const eventSource = new EventSource(`/api/run/${runId}/events`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as SSEEvent;
          handleEvent(data);
        } catch (err) {
          console.error("Failed to parse SSE event:", err);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          addLog(
            "warn",
            `Connection lost. Reconnecting... (attempt ${retryCountRef.current})`
          );
          setTimeout(() => connect(runId), 2000 * retryCountRef.current);
        } else {
          addLog("error", "Connection lost. Please refresh to see results.");
        }
      };
    },
    [handleEvent, addLog]
  );

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Load history
  const loadHistory = useCallback(async () => {
    try {
      const token = await getToken({ template: "convex" });
      const response = await fetch("/api/runs", {
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      const { runs } = await response.json();
      if (runs) {
        setHistory(runs);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, [setHistory, getToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, loadHistory };
}
