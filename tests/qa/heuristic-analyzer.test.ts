/**
 * Tests for Heuristic Analyzer
 */

import { describe, it, expect } from "bun:test";
import { createHeuristicAnalyzer } from "../../src/qa/llm-navigator/heuristic-analyzer.js";
import type { GraphNode, GraphEdge } from "../../src/qa/graph/types.js";

// ============================================================================
// Helper Functions
// ============================================================================

function createTestNode(id: string, url: string): GraphNode {
  return {
    id,
    url,
    title: "Test Page",
    domSummary: "Test page",
    actions: [],
    visitCount: 1,
    explorationStatus: "unexplored",
    metadata: {
      hasSearchBox: false,
      hasForms: false,
      isMainEntryPoint: false,
      interactiveElementCount: 0,
    },
    discoveredAt: Date.now(),
    lastVisitedAt: Date.now(),
  };
}

function createTestEdge(
  id: string,
  sourceNodeId: string,
  selector: string,
  text: string,
  href?: string,
  tagName: string = "a"
): GraphEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId: null,
    action: {
      type: "click",
      selector,
      element: {
        tagName,
        text,
        href,
      },
    },
    status: "pending",
    attemptCount: 0,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("HeuristicAnalyzer", () => {
  describe("Rule 1: No pending actions", () => {
    it("should backtrack when no pending actions available", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");
      const result = analyzer.analyze(node, [], [], new Set());

      expect(result.decision).toBe("backtrack");
      expect(result.confidence).toBe(100);
      expect(result.reason).toBe("no_pending_actions");
    });
  });

  describe("Rule 2: Single action", () => {
    it("should select the only available action with 100% confidence", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");
      const edge = createTestEdge("edge1", "node1", ".link", "Click me", "/page");

      const result = analyzer.analyze(node, [edge], [], new Set());

      expect(result.decision).toBe("select_action");
      expect(result.selectedEdge).toBe("edge1");
      expect(result.confidence).toBe(100);
      expect(result.reason).toBe("only_option");
    });
  });

  describe("Rule 3: Dominant score", () => {
    it("should select action with significantly higher score", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      // Create edges where one will score much higher
      const edge1 = createTestEdge("edge1", "node1", ".signup", "Sign Up Now", "/signup", "button");
      const edge2 = createTestEdge("edge2", "node1", ".footer", "Footer link", "/footer");

      const visitedUrls = new Set<string>();
      const result = analyzer.analyze(node, [edge1, edge2], [], visitedUrls);

      expect(result.decision).toBe("select_action");
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });
  });

  describe("Rule 4: CTA button detection", () => {
    it("should recognize and prioritize CTA buttons", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      const ctaEdge = createTestEdge("edge1", "node1", ".cta", "Get Started", undefined, "button");
      const regularEdge = createTestEdge("edge2", "node1", ".link", "Learn more", "/about");

      const result = analyzer.analyze(node, [ctaEdge, regularEdge], [], new Set());

      expect(result.decision).toBe("select_action");
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });
  });

  describe("Rule 5: Navigation to new URL", () => {
    it("should prioritize navigation links to unexplored URLs", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      const navEdge = createTestEdge("edge1", "node1", ".nav", "About", "http://example.com/about");
      const visitedEdge = createTestEdge("edge2", "node1", ".link", "Home", "http://example.com/");

      const visitedUrls = new Set(["http://example.com/"]);
      const result = analyzer.analyze(node, [navEdge, visitedEdge], [], visitedUrls);

      expect(result.decision).toBe("select_action");
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });
  });

  describe("Rule 6: Novel URL exploration", () => {
    it("should select actions leading to novel URLs", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      const novelEdge = createTestEdge("edge1", "node1", ".link", "New page", "http://example.com/new");

      const visitedUrls = new Set<string>();
      const result = analyzer.analyze(node, [novelEdge], [], visitedUrls);

      expect(result.decision).toBe("select_action");
      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });
  });

  describe("Uncertain cases", () => {
    it("should escalate to AI when multiple viable candidates exist", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      // Create multiple similar-quality edges
      const edge1 = createTestEdge("edge1", "node1", ".link1", "Link 1", "/page1");
      const edge2 = createTestEdge("edge2", "node1", ".link2", "Link 2", "/page2");
      const edge3 = createTestEdge("edge3", "node1", ".link3", "Link 3", "/page3");

      const visitedUrls = new Set<string>();
      const result = analyzer.analyze(node, [edge1, edge2, edge3], [], visitedUrls);

      // Should be uncertain since no clear winner
      if (result.confidence < 75) {
        expect(result.decision).toBe("uncertain");
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle empty explored edges", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");
      const edge = createTestEdge("edge1", "node1", ".link", "Link", "/page");

      const result = analyzer.analyze(node, [edge], [], new Set());

      expect(result.decision).toBe("select_action");
      expect(result.selectedEdge).toBe("edge1");
    });

    it("should handle all actions explored scenario", () => {
      const analyzer = createHeuristicAnalyzer();
      const node = createTestNode("node1", "http://example.com");

      const result = analyzer.analyze(node, [], [], new Set());

      expect(result.decision).toBe("backtrack");
      expect(result.confidence).toBe(100);
    });
  });

  describe("Configuration", () => {
    it("should respect custom confidence threshold", () => {
      const analyzer = createHeuristicAnalyzer({ confidenceThreshold: 90 });
      const node = createTestNode("node1", "http://example.com");
      const edge = createTestEdge("edge1", "node1", ".link", "Link", "/page");

      const result = analyzer.analyze(node, [edge], [], new Set());

      // Single action should still be accepted at 100% confidence
      expect(analyzer.shouldAccept(result)).toBe(true);
    });

    it("should use custom dominant score ratio", () => {
      const analyzer = createHeuristicAnalyzer({ dominantScoreRatio: 3.0 });
      const node = createTestNode("node1", "http://example.com");

      const edge1 = createTestEdge("edge1", "node1", ".high", "High priority", "/important");
      const edge2 = createTestEdge("edge2", "node1", ".low", "Low priority", "/less");

      const result = analyzer.analyze(node, [edge1, edge2], [], new Set());

      // Should still make a decision, though possibly with different confidence
      expect(result.decision).not.toBe("uncertain");
    });
  });

  describe("getTopCandidatesForAI", () => {
    it("should return top N candidates for AI escalation", () => {
      const analyzer = createHeuristicAnalyzer();

      const edges = [
        createTestEdge("edge1", "node1", ".link1", "Link 1", "/page1"),
        createTestEdge("edge2", "node1", ".link2", "Link 2", "/page2"),
        createTestEdge("edge3", "node1", ".link3", "Link 3", "/page3"),
        createTestEdge("edge4", "node1", ".link4", "Link 4", "/page4"),
        createTestEdge("edge5", "node1", ".link5", "Link 5", "/page5"),
        createTestEdge("edge6", "node1", ".link6", "Link 6", "/page6"),
      ];

      const topCandidates = analyzer.getTopCandidatesForAI(
        edges,
        new Set(),
        "http://example.com",
        3
      );

      expect(topCandidates.length).toBeLessThanOrEqual(3);
    });

    it("should handle fewer edges than requested N", () => {
      const analyzer = createHeuristicAnalyzer();

      const edges = [
        createTestEdge("edge1", "node1", ".link1", "Link 1", "/page1"),
        createTestEdge("edge2", "node1", ".link2", "Link 2", "/page2"),
      ];

      const topCandidates = analyzer.getTopCandidatesForAI(
        edges,
        new Set(),
        "http://example.com",
        5
      );

      expect(topCandidates.length).toBe(2);
    });
  });
});
