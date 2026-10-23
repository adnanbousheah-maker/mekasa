import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCKOUT, LOGIN_FAILED_MESSAGE, waitUntilElapsed } from "./lockout";

describe("LOGIN_FAILED_MESSAGE", () => {
  it("tells staff the lock rule without saying whether the phone exists", () => {
    expect(LOGIN_FAILED_MESSAGE).toContain(`${LOCKOUT.timedLockAfter} محاولات`);
    expect(LOGIN_FAILED_MESSAGE).toContain(`${LOCKOUT.timedLockMinutes} دقيقة`);
    expect(LOGIN_FAILED_MESSAGE).not.toMatch(/باقيلك|مش مسجل|موقوف/);
  });
});

describe("waitUntilElapsed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the rest of the minimum time", async () => {
    let done = false;
    const promise = waitUntilElapsed(1000, 700, () => 1200).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(done).toBe(true);
  });

  it("returns at once when the minimum time has passed", async () => {
    await expect(waitUntilElapsed(1000, 700, () => 2000)).resolves.toBeUndefined();
  });
});
