/**
 * Graph Types for LLM-Guided Exploration
 *
 * Models the website as a graph where:
 * - Nodes represent unique page states
 * - Edges represent actions that transition between states
 */

import type { ActionType } from "../action-selector.js";

// ============================================================================
// Graph Node Types
// ============================================================================

export type NodeExplorationStatus = "unexplored" | "partial" | "exhausted";

export interface NodeMetadata {
  /** Whether the page has search box(es) */
  hasSearchBox: boolean;
  /** Whether the page has form(s) */
  hasForms: boolean;
  /** Whether this is a main entry point (initial URL) */
  isMainEntryPoint: boolean;
  /** Number of interactive elements on the page */
  interactiveElementCount: number;
  /** Page load time in ms */
  loadTimeMs?: number;
}

export interface ElementInfo {
  tagName: string;
  text: string;
  role?: string;
  href?: string;
  type?: string;
  formId?: string;
  placeholder?: string;
  ariaLabel?: string;
  isDisabled?: boolean;
}

export interface GraphNode {
  /** Unique identifier - state hash */
  id: string;
  /** Full URL of the page */
  url: string;
  /** Page title */
  title: string;
  /** Compressed DOM summary for LLM context */
  domSummary: string;
  /** Available actions from this node */
  actions: GraphEdge[];
  /** Number of times this node has been visited */
  visitCount: number;
  /** Exploration status */
  explorationStatus: NodeExplorationStatus;
  /** Node metadata */
  metadata: NodeMetadata;
  /** Timestamp when node was first discovered */
  discoveredAt: number;
  /** Timestamp of last visit */
  lastVisitedAt: number;
}

// ============================================================================
// Graph Edge Types
// ============================================================================

export type EdgeStatus = "pending" | "explored" | "failed" | "skipped";

export interface EdgeAction {
  /** Type of action (click, fill, hover, etc.) */
  type: ActionType;
  /** CSS selector for the element */
  selector: string;
  /** Element information */
  element: ElementInfo;
  /** Value to use (for fill actions) */
  value?: string;
}

export interface GraphEdge {
  /** Unique identifier for this edge */
  id: string;
  /** Source node ID */
  sourceNodeId: string;
  /** Target node ID (null if unexplored) */
  targetNodeId: string | null;
  /** Action to perform */
  action: EdgeAction;
  /** Edge status */
  status: EdgeStatus;
  /** Priority assigned by LLM (1-10) */
  llmPriority?: number;
  /** LLM's rationale for the priority */
  llmRationale?: string;
  /** Hint for smart interaction (e.g., search query) */
  interactionHint?: string;
  /** Number of times this edge has been attempted */
  attemptCount: number;
  /** Last error message if failed */
  lastError?: string;
  /** Timestamp of last attempt */
  lastAttemptAt?: number;
}

// ============================================================================
// Exploration Stack Types
// ============================================================================

export interface StackFrame {
  /** Current node ID */
  nodeId: string;
  /** Pending edges to explore from this node */
  pendingEdges: GraphEdge[];
  /** Current depth in the exploration tree */
  depth: number;
  /** Function to return to this state (for backtracking) */
  returnAction: () => Promise<void>;
}

// ============================================================================
// Graph Statistics
// ============================================================================

export interface GraphStats {
  /** Total number of nodes */
  totalNodes: number;
  /** Number of fully explored nodes */
  exploredNodes: number;
  /** Number of partially explored nodes */
  partialNodes: number;
  /** Number of unexplored nodes */
  unexploredNodes: number;
  /** Total number of edges */
  totalEdges: number;
  /** Number of explored edges */
  exploredEdges: number;
  /** Number of pending edges */
  pendingEdges: number;
  /** Number of failed edges */
  failedEdges: number;
  /** Maximum depth reached */
  maxDepth: number;
  /** Average edges per node */
  avgEdgesPerNode: number;
}

// ============================================================================
// Exploration Graph Interface
// ============================================================================

export interface ExplorationGraph {
  /** Add a new node to the graph */
  addNode(node: GraphNode): void;
  /** Get a node by ID */
  getNode(id: string): GraphNode | undefined;
  /** Check if a node exists */
  hasNode(id: string): boolean;
  /** Update a node */
  updateNode(id: string, updates: Partial<GraphNode>): void;
  /** Add an edge to a node */
  addEdge(nodeId: string, edge: GraphEdge): void;
  /** Get an edge by ID */
  getEdge(nodeId: string, edgeId: string): GraphEdge | undefined;
  /** Update an edge */
  updateEdge(nodeId: string, edgeId: string, updates: Partial<GraphEdge>): void;
  /** Get all pending edges for a node */
  getPendingEdges(nodeId: string): GraphEdge[];
  /** Get graph statistics */
  getStats(): GraphStats;
  /** Get all nodes */
  getAllNodes(): GraphNode[];
  /** Clear the graph */
  clear(): void;
  /** Export graph for serialization */
  export(): { nodes: GraphNode[]; };
}
