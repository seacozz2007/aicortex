import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import {
  isMissingTaskError,
  isTransientDaemonError,
  transientDaemonRetryDelay,
} from "./query-errors";

describe("query-errors", () => {
  it("detects missing task 404", () => {
    expect(isMissingTaskError(new ApiError("task not found", 404, "Not Found"))).toBe(true);
    expect(isMissingTaskError(new ApiError("nope", 500, "Error"))).toBe(false);
  });

  it("detects transient daemon errors", () => {
    expect(isTransientDaemonError(new ApiError("daemon websocket not connected", 504, "Gateway Timeout"))).toBe(
      true,
    );
    expect(isTransientDaemonError(new ApiError("task not found", 404, "Not Found"))).toBe(false);
  });

  it("ramps retry delay", () => {
    expect(transientDaemonRetryDelay(0)).toBe(500);
    expect(transientDaemonRetryDelay(4)).toBe(5000);
  });
});
