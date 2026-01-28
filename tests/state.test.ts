/**
 * Tests for State Fingerprinting Module
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createStateTracker,
  fingerprintsEqual,
  fingerprintSimilarity,
  type StateFingerprint,
} from "../src/qa/state.js";

describe("StateTracker", () => {
  it("should create a tracker and record states", () => {
    const tracker = createStateTracker();
    assert.strictEqual(tracker.getUniqueStateCount(), 0);

    const fp: StateFingerprint = {
      urlHash: "h1", domStructureHash: "d1", visibleTextHash: "t1",
      formStateHash: "f1", dialogStateHash: "dl1", combinedHash: "c1", timestamp: Date.now(),
    };

    assert.strictEqual(tracker.recordState(fp), true);
    assert.strictEqual(tracker.recordState(fp), false);
    assert.strictEqual(tracker.getUniqueStateCount(), 1);
    assert.strictEqual(tracker.getVisitCount(fp), 2);
  });

  it("should track transitions and detect new states", () => {
    const tracker = createStateTracker();
    const s1: StateFingerprint = { urlHash: "1", domStructureHash: "1", visibleTextHash: "1", formStateHash: "1", dialogStateHash: "1", combinedHash: "c1", timestamp: Date.now() };
    const s2: StateFingerprint = { urlHash: "2", domStructureHash: "2", visibleTextHash: "2", formStateHash: "2", dialogStateHash: "2", combinedHash: "c2", timestamp: Date.now() };

    const t = tracker.recordTransition({ fromState: s1, toState: s2, action: { type: "click" }, timestamp: Date.now() });
    assert.strictEqual(t.isNewState, true);
    assert.strictEqual(tracker.getHistory().transitions.length, 1);
  });

  it("should reset correctly", () => {
    const tracker = createStateTracker();
    const fp: StateFingerprint = { urlHash: "1", domStructureHash: "1", visibleTextHash: "1", formStateHash: "1", dialogStateHash: "1", combinedHash: "c1", timestamp: Date.now() };
    tracker.recordState(fp);
    tracker.reset();
    assert.strictEqual(tracker.getUniqueStateCount(), 0);
  });
});

describe("fingerprintsEqual", () => {
  it("should compare by combinedHash", () => {
    const fp1: StateFingerprint = { urlHash: "1", domStructureHash: "1", visibleTextHash: "1", formStateHash: "1", dialogStateHash: "1", combinedHash: "same", timestamp: 1 };
    const fp2: StateFingerprint = { urlHash: "2", domStructureHash: "2", visibleTextHash: "2", formStateHash: "2", dialogStateHash: "2", combinedHash: "same", timestamp: 2 };
    const fp3: StateFingerprint = { ...fp1, combinedHash: "different" };

    assert.strictEqual(fingerprintsEqual(fp1, fp2), true);
    assert.strictEqual(fingerprintsEqual(fp1, fp3), false);
  });
});

describe("fingerprintSimilarity", () => {
  it("should calculate similarity correctly", () => {
    const fp1: StateFingerprint = { urlHash: "a", domStructureHash: "b", visibleTextHash: "c", formStateHash: "d", dialogStateHash: "e", combinedHash: "x", timestamp: 1 };
    const fp2: StateFingerprint = { urlHash: "a", domStructureHash: "b", visibleTextHash: "X", formStateHash: "Y", dialogStateHash: "Z", combinedHash: "y", timestamp: 1 };

    assert.strictEqual(fingerprintSimilarity(fp1, fp1), 1);
    assert.strictEqual(fingerprintSimilarity(fp1, fp2), 0.5);
  });
});
