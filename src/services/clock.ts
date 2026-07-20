// Injectable clock seam — every time-dependent decision in the bot routes
// through here so tests can override `now()` without touching Date internals.

/** Returns the current Date. Override in tests for deterministic time. */
export type ClockFn = () => Date;

let clock: ClockFn = () => new Date();

/** Get the current time (injectable). */
export function now(): Date {
  return clock();
}

/** Override the clock (test-only hook). */
export function setClock(fn: ClockFn): void {
  clock = fn;
}

/** Reset to the real clock (test cleanup). */
export function resetClock(): void {
  clock = () => new Date();
}
