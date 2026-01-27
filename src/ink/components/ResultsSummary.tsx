import React from "react";
import { Box, Text } from "ink";
import type { Report, IssueSeverity } from "../../qa/types.js";

interface ResultsSummaryProps {
  report: Report;
}

const severityIcons: Record<IssueSeverity, string> = {
  blocker: "!!!",
  high: "!!",
  medium: "!",
  low: ".",
  nit: "-",
};

const severityColors: Record<IssueSeverity, string> = {
  blocker: "red",
  high: "red",
  medium: "yellow",
  low: "cyan",
  nit: "gray",
};

function getScoreColor(score: number): string {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

export function ResultsSummary({ report }: ResultsSummaryProps): React.ReactElement {
  const scoreColor = getScoreColor(report.score);
  const barWidth = 20;
  const filledWidth = Math.round((report.score / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text color="green" bold>
          {"[x]"} Test Complete
        </Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={scoreColor} paddingX={2} paddingY={1}>
        {/* Score */}
        <Box>
          <Text>Score: </Text>
          <Text color={scoreColor} bold>
            {report.score}/100
          </Text>
          <Text>  </Text>
          <Text color={scoreColor}>{"█".repeat(filledWidth)}</Text>
          <Text dimColor>{"░".repeat(emptyWidth)}</Text>
        </Box>

        {/* Summary */}
        <Box marginTop={1}>
          <Text>{report.summary}</Text>
        </Box>

        {/* Issues */}
        {report.issues.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Issues: {report.issues.length}</Text>
            {report.issues.slice(0, 5).map((issue, index) => (
              <Box key={index} marginTop={index === 0 ? 1 : 0}>
                <Text color={severityColors[issue.severity]}>
                  [{severityIcons[issue.severity]}]
                </Text>
                <Text> </Text>
                <Text color="cyan">{issue.category}:</Text>
                <Text> {issue.title}</Text>
              </Box>
            ))}
            {report.issues.length > 5 && (
              <Text dimColor>... and {report.issues.length - 5} more issues</Text>
            )}
          </Box>
        )}

        {/* Artifacts */}
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor bold>Output Files:</Text>
          <Text dimColor>  Screenshots: {report.artifacts.evidenceFile}</Text>
          {report.artifacts.reportFile && (
            <Text dimColor>  Report: {report.artifacts.reportFile}</Text>
          )}
          {report.artifacts.llmFixFile && (
            <Text dimColor>  LLM Fix: {report.artifacts.llmFixFile}</Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[q] Exit</Text>
      </Box>
    </Box>
  );
}
