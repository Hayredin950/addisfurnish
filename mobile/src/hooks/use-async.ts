import { useCallback, useEffect, useRef, useState } from "react";

/** Tiny async-data hook (no react-query dependency on mobile). */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  enabled = true,
): { data: T | null; error: Error | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refetch };
}
