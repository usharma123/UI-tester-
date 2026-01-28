/**
 * Update notification banner component
 * Displays a yellow banner when a new version is available
 */

import React from "react";
import { Box, Text } from "ink";
import type { UpdateInfo } from "../../updates/types.js";

interface UpdateNotificationProps {
  updateInfo: UpdateInfo;
}

export function UpdateNotification({
  updateInfo,
}: UpdateNotificationProps): React.ReactElement {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      marginBottom={1}
    >
      <Text color="yellow">
        Update available!{" "}
        <Text color="gray">{updateInfo.currentVersion}</Text>
        <Text color="yellow"> → </Text>
        <Text color="green">{updateInfo.latestVersion}</Text>
        {"  "}
        <Text color="white">Run: </Text>
        <Text color="cyan">{updateInfo.updateCommand}</Text>
      </Text>
    </Box>
  );
}
