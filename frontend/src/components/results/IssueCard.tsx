import { useClipboard } from "@/hooks/useClipboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";
import type { Issue } from "@/lib/types";
import { toast } from "sonner";

interface IssueCardProps {
  issue: Issue;
  index: number;
  url?: string;
  onImageClick?: (src: string, label: string) => void;
}

const severityColors: Record<Issue["severity"], string> = {
  blocker: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-500 text-black",
  low: "bg-blue-500 text-white",
  nit: "bg-zinc-500 text-white",
};

function generatePrompt(issue: Issue, url: string): string {
  const reproSteps = issue.reproSteps
    .map((step, idx) => `${idx + 1}. ${step}`)
    .join("\n");

  return `I need help fixing a UI issue on my website.

## Context
- URL: ${url}
- Issue Category: ${issue.category}
- Severity: ${issue.severity}

## Issue: ${issue.title}

### Steps to Reproduce
${reproSteps}

### Expected Behavior
${issue.expected}

### Actual Behavior
${issue.actual}

### Suggested Fix
${issue.suggestedFix}

Please analyze this issue and provide:
1. The likely root cause
2. Specific code changes needed to fix it
3. Any additional improvements you'd recommend`;
}

export function IssueCard({ issue, index, url = "", onImageClick }: IssueCardProps) {
  const { copy, copied } = useClipboard();

  const handleCopyPrompt = async () => {
    const prompt = generatePrompt(issue, url);
    const success = await copy(prompt);
    if (success) {
      toast.success("LLM prompt copied to clipboard");
    } else {
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value={`issue-${index}`}
        className="border border-border rounded-lg overflow-hidden bg-gradient-to-br from-secondary/50 to-card"
      >
        <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-secondary/50 group">
          <div className="flex items-center gap-3 flex-1 text-left">
            {/* Severity badge */}
            <Badge
              className={cn(
                "text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5",
                severityColors[issue.severity]
              )}
            >
              {issue.severity}
            </Badge>

            {/* Category badge */}
            <Badge variant="outline" className="text-[10px] font-mono uppercase">
              {issue.category}
            </Badge>

            {/* Title */}
            <span className="flex-1 text-sm font-medium">{issue.title}</span>
          </div>
        </AccordionTrigger>

        <AccordionContent className="px-5 pb-5 pt-2 border-t border-border/50 bg-background">
          <div className="space-y-5">
            {/* Reproduction Steps */}
            <div>
              <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-dashed border-border">
                Reproduction Steps
              </h4>
              <ul className="space-y-1">
                {issue.reproSteps.map((step, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-muted-foreground relative pl-5"
                  >
                    <span className="absolute left-0 text-foreground/50 font-mono">
                      ›
                    </span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            {/* Expected */}
            <div>
              <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-dashed border-border">
                Expected
              </h4>
              <p className="text-sm text-muted-foreground">{issue.expected}</p>
            </div>

            {/* Actual */}
            <div>
              <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-dashed border-border">
                Actual
              </h4>
              <p className="text-sm text-muted-foreground">{issue.actual}</p>
            </div>

            {/* Suggested Fix */}
            <div>
              <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-dashed border-border">
                Suggested Fix
              </h4>
              <p className="text-sm text-muted-foreground">{issue.suggestedFix}</p>
            </div>

            {/* Evidence */}
            {issue.evidence && issue.evidence.length > 0 && (
              <div>
                <h4 className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest mb-2 pb-1 border-b border-dashed border-border">
                  Evidence
                </h4>
                <div className="flex gap-2 flex-wrap">
                  {issue.evidence.map((evidenceUrl, idx) => (
                    <button
                      key={idx}
                      onClick={() => onImageClick?.(evidenceUrl, "Issue evidence")}
                      className="w-24 h-16 rounded-md overflow-hidden border border-border hover:border-foreground transition-colors group"
                    >
                      <img
                        src={evidenceUrl}
                        alt={`Evidence ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end pt-4 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyPrompt}
                className="font-mono text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-2" />
                    Copy LLM Prompt
                  </>
                )}
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
