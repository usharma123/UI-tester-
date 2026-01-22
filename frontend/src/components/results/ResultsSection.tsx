import { useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useClipboard } from "@/hooks/useClipboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreGauge } from "./ScoreGauge";
import { IssueCard } from "./IssueCard";
import { ScreenshotsGallery } from "./ScreenshotsGallery";
import { ImageModal } from "./ImageModal";
import { CheckCircle, AlertTriangle, Workflow, Copy, Check, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Report } from "@/lib/types";

function generateAllIssuesPrompt(report: Report): string {
  const flowsList = report.testedFlows.map((flow) => `- ${flow}`).join("\n");

  const issuesText = report.issues
    .map((issue, idx) => {
      const reproSteps = issue.reproSteps
        .map((step, stepIdx) => `${stepIdx + 1}. ${step}`)
        .join("\n");

      return `### Issue ${idx + 1}: ${issue.title}
**Category:** ${issue.category}
**Severity:** ${issue.severity}

**Steps to Reproduce:**
${reproSteps}

**Expected Behavior:**
${issue.expected}

**Actual Behavior:**
${issue.actual}

**Suggested Fix:**
${issue.suggestedFix}`;
    })
    .join("\n\n---\n\n");

  return `I need help fixing multiple UI issues found during QA testing.

## Website Context
- URL: ${report.url || "N/A"}
- Overall Score: ${report.score}/100
- Summary: ${report.summary}

## Tested Flows
${flowsList}

## Issues Found (${report.issues.length} total)

${issuesText}

Please analyze these issues and provide:
1. A prioritized fix order based on severity and dependencies
2. Specific code changes for each issue
3. Any patterns you notice that might indicate systemic problems
4. Recommendations for preventing similar issues in the future`;
}

export function ResultsSection() {
  const status = useAppStore((s) => s.status);
  const report = useAppStore((s) => s.report);
  const screenshots = useAppStore((s) => s.screenshots);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalImage, setModalImage] = useState({ src: "", label: "" });
  const { copy, copied } = useClipboard();

  const handleImageClick = (src: string, label: string) => {
    setModalImage({ src, label });
    setModalOpen(true);
  };

  const handleCopyAll = async () => {
    if (!report) return;
    const prompt = generateAllIssuesPrompt(report);
    const success = await copy(prompt);
    if (success) {
      toast.success("All issues copied to clipboard");
    } else {
      toast.error("Failed to copy to clipboard");
    }
  };

  if (status !== "completed" || !report) return null;

  return (
    <section className="animate-slide-up space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-border/50 relative">
        <div className="absolute bottom-0 left-0 w-32 h-0.5 bg-gradient-to-r from-emerald-400 to-transparent" />
        <div className="flex items-center gap-4">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
          <h2 className="text-2xl font-medium">Analysis Complete</h2>
        </div>
      </div>

      {/* Score card */}
      <ScoreGauge score={report.score} summary={report.summary} />

      {/* Tested flows */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-lg font-medium">
            <Workflow className="w-5 h-5 text-muted-foreground" />
            Tested Flows
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {report.testedFlows.map((flow, idx) => (
              <Badge
                key={idx}
                variant="secondary"
                className="text-sm px-3 py-1.5 hover:bg-secondary/80 cursor-default"
              >
                {flow}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Issues */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3 text-lg font-medium">
              <AlertTriangle className="w-5 h-5 text-muted-foreground" />
              Issues Found
              <Badge variant="destructive" className="ml-2">
                {report.issues.length}
              </Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {report.issues.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No issues found! The website passed all tests.
            </p>
          ) : (
            <>
              {report.issues.map((issue, idx) => (
                <IssueCard
                  key={idx}
                  issue={issue}
                  index={idx}
                  url={report.url}
                  onImageClick={handleImageClick}
                />
              ))}

              {/* Copy all section */}
              <div className="mt-6 pt-6 border-t border-border/50">
                <div className="flex items-center justify-between gap-4 p-4 bg-secondary/50 rounded-lg border border-dashed border-border">
                  <div className="flex items-center gap-4">
                    <FileText className="w-6 h-6 text-muted-foreground shrink-0" />
                    <div>
                      <h4 className="text-sm font-medium">Export All Issues</h4>
                      <p className="text-xs text-muted-foreground">
                        Copy all issues as a single LLM prompt for AI-assisted fixing
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyAll}
                    className="font-mono text-xs shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-2" />
                        Copy All Issues
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Screenshots gallery */}
      <ScreenshotsGallery screenshots={screenshots} onImageClick={handleImageClick} />

      {/* Image modal */}
      <ImageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        src={modalImage.src}
        label={modalImage.label}
      />
    </section>
  );
}
