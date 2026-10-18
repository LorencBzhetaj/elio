/**
 * Runs async requests so that only the most recent one can deliver a result. Older requests are aborted,
 * and if one still resolves late it is reported as stale and must be ignored.
 */
export function createLatestOnly() {
  let seq = 0;
  let controller: AbortController | null = null;
  return {
    async run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<{ stale: true } | { stale: false; value: T }> {
      const mine = ++seq;
      controller?.abort();
      const ctrl = (controller = new AbortController());
      try {
        const value = await task(ctrl.signal);
        return mine === seq ? { stale: false, value } : { stale: true };
      } catch (err) {
        if (mine !== seq) return { stale: true };
        throw err;
      }
    },
    cancel() {
      seq++;
      controller?.abort();
    },
  };
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
