/**
 * Exploration Graph Implementation
 *
 * Manages the graph data structure for LLM-guided website exploration.
 */

import type {
  ExplorationGraph,
  GraphNode,
  GraphEdge,
  GraphStats,
  NodeExplorationStatus,
} from "./types.js";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique edge ID
 */
export function generateEdgeId(sourceNodeId: string, selector: string, actionType: string): string {
  // Create a deterministic ID from source, selector, and action type
  const combined = `${sourceNodeId}:${actionType}:${selector}`;
  // Simple hash for uniqueness
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `e_${Math.abs(hash).toString(16)}`;
}

/**
 * Calculate exploration status based on edge states
 */
function calculateExplorationStatus(edges: GraphEdge[]): NodeExplorationStatus {
  if (edges.length === 0) {
    return "exhausted";
  }

  const pendingCount = edges.filter(e => e.status === "pending").length;
  const exploredCount = edges.filter(e => e.status === "explored" || e.status === "failed").length;

  if (pendingCount === 0) {
    return "exhausted";
  }

  if (exploredCount === 0) {
    return "unexplored";
  }

  return "partial";
}

// ============================================================================
// Exploration Graph Implementation
// ============================================================================

/**
 * Create an exploration graph
 */
export function createExplorationGraph(): ExplorationGraph {
  const nodes = new Map<string, GraphNode>();

  return {
    addNode(node: GraphNode): void {
      if (!nodes.has(node.id)) {
        nodes.set(node.id, { ...node });
      }
    },

    getNode(id: string): GraphNode | undefined {
      return nodes.get(id);
    },

    hasNode(id: string): boolean {
      return nodes.has(id);
    },

    updateNode(id: string, updates: Partial<GraphNode>): void {
      const node = nodes.get(id);
      if (node) {
        Object.assign(node, updates);
        // Recalculate exploration status if edges changed
        if (updates.actions) {
          node.explorationStatus = calculateExplorationStatus(node.actions);
        }
      }
    },

    addEdge(nodeId: string, edge: GraphEdge): void {
      const node = nodes.get(nodeId);
      if (node) {
        // Check if edge already exists
        const existingEdge = node.actions.find(e => e.id === edge.id);
        if (!existingEdge) {
          node.actions.push({ ...edge });
          node.explorationStatus = calculateExplorationStatus(node.actions);
        }
      }
    },

    getEdge(nodeId: string, edgeId: string): GraphEdge | undefined {
      const node = nodes.get(nodeId);
      if (node) {
        return node.actions.find(e => e.id === edgeId);
      }
      return undefined;
    },

    updateEdge(nodeId: string, edgeId: string, updates: Partial<GraphEdge>): void {
      const node = nodes.get(nodeId);
      if (node) {
        const edge = node.actions.find(e => e.id === edgeId);
        if (edge) {
          Object.assign(edge, updates);
          node.explorationStatus = calculateExplorationStatus(node.actions);
        }
      }
    },

    getPendingEdges(nodeId: string): GraphEdge[] {
      const node = nodes.get(nodeId);
      if (node) {
        return node.actions.filter(e => e.status === "pending");
      }
      return [];
    },

    getStats(): GraphStats {
      const allNodes = Array.from(nodes.values());
      const allEdges = allNodes.flatMap(n => n.actions);

      const exploredNodes = allNodes.filter(n => n.explorationStatus === "exhausted").length;
      const partialNodes = allNodes.filter(n => n.explorationStatus === "partial").length;
      const unexploredNodes = allNodes.filter(n => n.explorationStatus === "unexplored").length;

      const exploredEdges = allEdges.filter(e => e.status === "explored").length;
      const pendingEdges = allEdges.filter(e => e.status === "pending").length;
      const failedEdges = allEdges.filter(e => e.status === "failed").length;

      // Calculate max depth (would need to track this during exploration)
      // For now, return 0 as placeholder
      const maxDepth = 0;

      return {
        totalNodes: allNodes.length,
        exploredNodes,
        partialNodes,
        unexploredNodes,
        totalEdges: allEdges.length,
        exploredEdges,
        pendingEdges,
        failedEdges,
        maxDepth,
        avgEdgesPerNode: allNodes.length > 0 ? allEdges.length / allNodes.length : 0,
      };
    },

    getAllNodes(): GraphNode[] {
      return Array.from(nodes.values());
    },

    clear(): void {
      nodes.clear();
    },

    export(): { nodes: GraphNode[] } {
      return {
        nodes: Array.from(nodes.values()),
      };
    },
  };
}

// ============================================================================
// DOM Summary Generation
// ============================================================================

/**
 * Script to generate a compressed DOM summary for LLM context
 */
export const DOM_SUMMARY_SCRIPT = `
(function() {
  const MAX_ELEMENTS = 50;
  const MAX_TEXT_LENGTH = 100;

  function getElementSummary(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.textContent || '').trim().slice(0, MAX_TEXT_LENGTH);
    const role = el.getAttribute('role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const href = el.getAttribute('href') || '';
    const type = el.getAttribute('type') || '';

    let summary = tag;
    if (role) summary += '[role=' + role + ']';
    if (type && (tag === 'input' || tag === 'button')) summary += '[type=' + type + ']';
    if (href && tag === 'a') {
      const path = href.startsWith('http') ? new URL(href).pathname : href;
      summary += '[href=' + path.slice(0, 50) + ']';
    }

    const label = ariaLabel || placeholder || text;
    if (label) summary += ': "' + label.slice(0, 50) + '"';

    return summary;
  }

  // Collect important elements
  const selectors = [
    'nav a', 'header a', 'footer a',
    'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]',
    'form', 'h1', 'h2', 'h3',
    '[class*="search"]', '[class*="login"]', '[class*="signup"]'
  ];

  const elements = [];
  const seen = new Set();

  for (const selector of selectors) {
    try {
      const found = document.querySelectorAll(selector);
      for (const el of found) {
        if (elements.length >= MAX_ELEMENTS) break;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const summary = getElementSummary(el);
        if (!seen.has(summary)) {
          seen.add(summary);
          elements.push(summary);
        }
      }
    } catch (e) {
      // Ignore selector errors
    }

    if (elements.length >= MAX_ELEMENTS) break;
  }

  return elements.join('\\n');
})()
`;

/**
 * Script to detect search boxes on the page
 */
export const DETECT_SEARCH_SCRIPT = `
(function() {
  const searchSelectors = [
    'input[type="search"]',
    'input[name*="search"]',
    'input[placeholder*="search" i]',
    'input[aria-label*="search" i]',
    '[role="searchbox"]',
    'input[class*="search" i]',
    'input[id*="search" i]'
  ];

  for (const selector of searchSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return true;
        }
      }
    } catch (e) {}
  }

  return false;
})()
`;

/**
 * Script to detect forms on the page
 */
export const DETECT_FORMS_SCRIPT = `
(function() {
  const forms = document.querySelectorAll('form');
  let visibleForms = 0;

  for (const form of forms) {
    const style = window.getComputedStyle(form);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      const rect = form.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        visibleForms++;
      }
    }
  }

  return visibleForms > 0;
})()
`;

/**
 * Script to get page title
 */
export const GET_TITLE_SCRIPT = `document.title || ''`;

/**
 * Script to count interactive elements
 */
export const COUNT_INTERACTIVE_SCRIPT = `
(function() {
  const selectors = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[onclick]'
  ];

  let count = 0;
  const seen = new Set();

  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);

        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            count++;
          }
        }
      }
    } catch (e) {}
  }

  return count;
})()
`;
