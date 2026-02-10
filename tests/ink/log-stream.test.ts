import { describe, expect, test } from "bun:test";
import { appReducer } from "../../src/ink/state/app-state.js";
import { initialState } from "../../src/ink/types.js";
import { initialValidateState } from "../../src/ink/validate-types.js";
import { validateAppReducer } from "../../src/ink/state/validation-state.js";

function makeLogEvent(message: string, timestamp: number) {
  return {
    type: "log" as const,
    message,
    level: "info" as const,
    timestamp,
  };
}

describe("log follow behavior", () => {
  test("app reducer follows new logs by default", () => {
    let state = appReducer({ ...initialState, mode: "running", logViewLines: 4 }, { type: "START_RUN" });

    for (let i = 0; i < 6; i += 1) {
      state = appReducer(state, { type: "PROCESS_EVENT", event: makeLogEvent(`log-${i}`, i) });
    }

    expect(state.autoFollowLogs).toBe(true);
    expect(state.logScrollOffset).toBe(2);
  });

  test("scrolling disables follow until jump-to-end", () => {
    let state = appReducer({ ...initialState, mode: "running", logViewLines: 4 }, { type: "START_RUN" });

    for (let i = 0; i < 6; i += 1) {
      state = appReducer(state, { type: "PROCESS_EVENT", event: makeLogEvent(`log-${i}`, i) });
    }

    state = appReducer(state, { type: "SCROLL_LOGS", delta: -1 });
    expect(state.autoFollowLogs).toBe(false);
    expect(state.logScrollOffset).toBe(1);

    state = appReducer(state, {
      type: "PROCESS_EVENT",
      event: makeLogEvent("new-log-while-unfollowed", 100),
    });
    expect(state.logScrollOffset).toBe(1);

    state = appReducer(state, { type: "JUMP_LOGS", position: "end" });
    expect(state.autoFollowLogs).toBe(true);

    state = appReducer(state, {
      type: "PROCESS_EVENT",
      event: makeLogEvent("new-log-while-following", 101),
    });
    expect(state.logScrollOffset).toBe(4);
  });

  test("page-style scrolling is clamped to bounds", () => {
    let state = appReducer({ ...initialState, mode: "running", logViewLines: 3 }, { type: "START_RUN" });
    for (let i = 0; i < 7; i += 1) {
      state = appReducer(state, { type: "PROCESS_EVENT", event: makeLogEvent(`log-${i}`, i) });
    }

    state = appReducer(state, { type: "SCROLL_LOGS", delta: -100 });
    expect(state.logScrollOffset).toBe(0);

    state = appReducer(state, { type: "SCROLL_LOGS", delta: 100 });
    expect(state.logScrollOffset).toBe(4);
  });

  test("validation reducer uses the same follow contract", () => {
    let state = validateAppReducer(
      { ...initialValidateState, mode: "running", logViewLines: 3 },
      { type: "START_RUN" }
    );

    for (let i = 0; i < 5; i += 1) {
      state = validateAppReducer(state, {
        type: "ADD_LOG",
        message: `log-${i}`,
        level: "info",
      });
    }

    expect(state.logScrollOffset).toBe(2);
    state = validateAppReducer(state, { type: "SCROLL_LOGS", delta: -1 });
    expect(state.autoFollowLogs).toBe(false);

    state = validateAppReducer(state, { type: "JUMP_LOGS", position: "end" });
    expect(state.autoFollowLogs).toBe(true);
  });
});
