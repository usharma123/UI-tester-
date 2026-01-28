/**
 * Component to display traceability report summary
 */

import React from "react";
import { Box, Text } from "ink";
import type { TraceabilityReport as Report } from "../../validation/types.js";

interface TraceabilityReportProps {
  report: Report;
  reportPath: string | null;
  markdownPath: string | null;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "pass":
      return "green";
    case "partial":
      return "yellow";
    case "fail":
      return "red";
    case "not_tested":
      return "gray";
    default:
      return "white";
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "pass":
      return "[PASS]";
    case "partial":
      return "[PART]";
    case "fail":
      return "[FAIL]";
    case "not_tested":
      return "[----]";
    default:
      return "[????]";
  }
}

function getScoreColor(score: number): string {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  if (score >= 40) return "red";
  return "red";
}

export function TraceabilityReport({
  report,
  reportPath,
  markdownPath,
}: TraceabilityReportProps): React.ReactElement {
  const passed = report.results.filter((r) => r.status === "pass").length;
  const partial = report.results.filter((r) => r.status === "partial").length;
  const failed = report.results.filter((r) => r.status === "fail").length;
  const notTested = report.results.filter((r) => r.status === "not_tested").length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
        <Box flexDirection="column">
          <Text bold color="cyan">
            Validation Complete
          </Text>
          <Box marginTop={1}>
            <Text>
              Overall Score:{" "}
              <Text bold color={getScoreColor(report.overallScore)}>
                {report.overallScore}/100
              </Text>
            </Text>
          </Box>
          <Box>
            <Text>
              Coverage:{" "}
              <Text bold color={getScoreColor(report.coverageScore)}>
                {report.coverageScore}%
              </Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color="green">{passed} passed</Text>
            <Text> | </Text>
            <Text color="yellow">{partial} partial</Text>
            <Text> | </Text>
            <Text color="red">{failed} failed</Text>
            <Text> | </Text>
            <Text color="gray">{notTested} not tested</Text>
          </Box>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Results by Requirement:</Text>
        <Box flexDirection="column" marginTop={1}>
          {report.results.slice(0, 10).map((result) => {
            const req = report.requirements.find(
              (r) => r.id === result.requirementId
            );
            return (
              <Box key={result.requirementId} marginLeft={1}>
                <Text color={getStatusColor(result.status)}>
                  {getStatusIcon(result.status)}
                </Text>
                <Text> </Text>
                <Text color="cyan">{result.requirementId}</Text>
                <Text> </Text>
                <Text dimColor>({result.score}/100)</Text>
                <Text> </Text>
                <Text>{req?.summary || "Unknown requirement"}</Text>
              </Box>
            );
          })}
          {report.results.length > 10 && (
            <Box marginLeft={1}>
              <Text dimColor>... and {report.results.length - 10} more</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Reports saved:</Text>
        <Box marginLeft={1} flexDirection="column">
          {reportPath && <Text dimColor>JSON: {reportPath}</Text>}
          {markdownPath && <Text dimColor>Markdown: {markdownPath}</Text>}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press 'q' to quit</Text>
      </Box>
    </Box>
  );
}
