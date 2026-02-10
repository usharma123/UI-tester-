import React from "react";
import { Box, Text } from "ink";
import type { SitemapUrl } from "../../qa/progress-types.js";
import { SectionTitle } from "./primitives/SectionTitle.js";
import { truncateText } from "../utils/truncate.js";

interface SitemapDisplayProps {
  sitemap: SitemapUrl[];
  source: string;
  maxHeight?: number;
  maxWidth?: number;
}

// Get path from URL
function getUrlPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || "/";
  } catch {
    return url;
  }
}

// Tree node for hierarchical sitemap
interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  priority?: number;
}

// Build a tree from flat URL paths
function buildPathTree(sitemap: SitemapUrl[]): TreeNode {
  const root: TreeNode = {
    name: "",
    fullPath: "/",
    children: new Map(),
  };

  for (const url of sitemap) {
    const path = getUrlPath(url.loc);
    const segments = path.split("/").filter((s) => s.length > 0);

    let current = root;
    let currentPath = "";

    // Handle root path
    if (segments.length === 0) {
      root.priority = url.priority;
      continue;
    }

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentPath += "/" + segment;

      if (!current.children.has(segment)) {
        current.children.set(segment, {
          name: segment,
          fullPath: currentPath,
          children: new Map(),
        });
      }

      const child = current.children.get(segment)!;
      
      // Set priority on the actual page node
      if (i === segments.length - 1) {
        child.priority = url.priority;
      }

      current = child;
    }
  }

  return root;
}

// Render tree node recursively
interface TreeLine {
  text: string;
  path: string;
  priority?: number;
  indent: number;
}

function flattenTree(
  node: TreeNode,
  prefix: string = "",
  isLast: boolean = true,
  isRoot: boolean = true,
  lines: TreeLine[] = []
): TreeLine[] {
  if (isRoot) {
    // Add root if it has priority (is an actual page)
    if (node.priority !== undefined) {
      lines.push({ text: "/", path: "/", priority: node.priority, indent: 0 });
    }
  } else {
    const connector = isLast ? "└─ " : "├─ ";
    lines.push({
      text: prefix + connector + node.name,
      path: node.fullPath,
      priority: node.priority,
      indent: prefix.length,
    });
  }

  const children = Array.from(node.children.values());
  const newPrefix = isRoot ? "" : prefix + (isLast ? "   " : "│  ");

  children.forEach((child, index) => {
    const childIsLast = index === children.length - 1;
    flattenTree(child, newPrefix, childIsLast, false, lines);
  });

  return lines;
}

export function SitemapDisplay({
  sitemap,
  source,
  maxHeight = 10,
  maxWidth = 100,
}: SitemapDisplayProps): React.ReactElement {
  if (sitemap.length === 0) {
    return <></>;
  }

  const tree = buildPathTree(sitemap);
  const lines = flattenTree(tree);
  const highPriorityCount = sitemap.filter((url) => typeof url.priority === "number" && url.priority >= 0.8).length;

  // Reserve lines for chrome: title(1) + border top/bottom(2) = 3
  const maxItems = Math.max(1, maxHeight - 3);
  const displayLines = lines.slice(0, maxItems);
  const hasMore = lines.length > maxItems;
  const lineWidth = Math.max(18, maxWidth - 16);
  const hpSuffix = highPriorityCount > 0 ? `, ${highPriorityCount} high-priority` : "";

  return (
    <Box flexDirection="column">
      <SectionTitle title="Discovered Pages" summary={`(${sitemap.length} via ${source}${hpSuffix})`} />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
      >
        {displayLines.map((line, index) => (
          <Box key={line.path + index}>
            <Text color="cyan">{truncateText(line.text, lineWidth)}</Text>
            {line.priority !== undefined && <Text dimColor> ({line.priority})</Text>}
          </Box>
        ))}
        {hasMore && (
          <Text dimColor>  ... {lines.length - maxItems} more</Text>
        )}
      </Box>
    </Box>
  );
}
