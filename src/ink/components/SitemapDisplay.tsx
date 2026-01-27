import React from "react";
import { Box, Text } from "ink";
import type { SitemapUrl } from "../../qa/progress-types.js";

interface SitemapDisplayProps {
  sitemap: SitemapUrl[];
  source: string;
  maxHeight?: number;
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

export function SitemapDisplay({ sitemap, source, maxHeight = 10 }: SitemapDisplayProps): React.ReactElement {
  if (sitemap.length === 0) {
    return <></>;
  }

  const tree = buildPathTree(sitemap);
  const lines = flattenTree(tree);
  
  // Limit displayed lines if needed
  const displayLines = lines.slice(0, maxHeight);
  const hasMore = lines.length > maxHeight;

  return (
    <Box flexDirection="column" marginTop={1} height={maxHeight + 4} overflowY="hidden">
      <Box>
        <Text bold>Discovered Pages</Text>
        <Text dimColor> ({sitemap.length} pages via {source})</Text>
      </Box>

      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="gray"
        paddingX={1}
        paddingY={0}
        height={maxHeight + 2}
        overflowY="hidden"
      >
        {displayLines.map((line, index) => (
          <Box key={line.path + index}>
            <Text dimColor>{line.text.slice(0, line.text.lastIndexOf(" ") + 1)}</Text>
            <Text color="cyan">{line.text.slice(line.text.lastIndexOf(" ") + 1) || line.text}</Text>
            {line.priority !== undefined && <Text dimColor> ({line.priority})</Text>}
          </Box>
        ))}
        {hasMore && (
          <Text dimColor>  ... {lines.length - maxHeight} more</Text>
        )}
      </Box>
    </Box>
  );
}
