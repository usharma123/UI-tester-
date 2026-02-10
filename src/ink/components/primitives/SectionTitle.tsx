import React from "react";
import { Box, Text } from "ink";

interface SectionTitleProps {
  title: string;
  summary?: string;
}

export function SectionTitle({ title, summary }: SectionTitleProps): React.ReactElement {
  return (
    <Box marginBottom={1}>
      <Text bold>{title}</Text>
      {summary && <Text color="gray"> {summary}</Text>}
    </Box>
  );
}
