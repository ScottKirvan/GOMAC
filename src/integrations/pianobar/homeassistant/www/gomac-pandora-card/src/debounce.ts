/**
 * Trailing-edge debounce, deliberately matching Home Assistant frontend's own
 * `src/common/util/debounce.ts` (used by its media_player more-info dialog's
 * volume slider) rather than a generic third-party implementation: the last
 * call within the wait window always wins, and every call resets the timer.
 */
export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  cancel(): void;
}

export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let trailingArgs: Args | undefined;

  const debounced = ((...args: Args): void => {
    trailingArgs = args;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (trailingArgs) {
        fn(...trailingArgs);
        trailingArgs = undefined;
      }
    }, waitMs);
  }) as Debounced<Args>;

  debounced.cancel = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = undefined;
    trailingArgs = undefined;
  };

  return debounced;
}
