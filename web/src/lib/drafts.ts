import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Unsent text kept in `localStorage` so a half-written message or offer
 * survives a reload, a tab switch or an accidental navigation (item 42).
 *
 * The sell form already had drafts, but a long message to a seller or a
 * carefully worded offer was lost the moment the page moved. Drafts are keyed
 * per conversation / listing, so two threads never share one.
 */
const PREFIX = "addishome:draft:";

export function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    // Private-mode Safari throws on any localStorage access; a lost draft is
    // not worth breaking the composer over.
    return "";
  }
}

export function writeDraft(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    if (value.trim()) window.localStorage.setItem(PREFIX + key, value);
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore — see readDraft */
  }
}

export function clearDraft(key: string): void {
  writeDraft(key, "");
}

/**
 * `useState` that persists. `key` may change (switching conversations): the
 * value is then re-read for the new key rather than carried over.
 *
 * Writes are debounced by half a second so typing doesn't hit storage on
 * every keystroke, and flushed on unmount so nothing is lost on navigation.
 */
export function useDraft(key: string): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState(() => readDraft(key));
  const latest = useRef(value);
  const activeKey = useRef(key);

  useEffect(() => {
    // Flush the previous key before adopting the new one.
    if (activeKey.current !== key) {
      writeDraft(activeKey.current, latest.current);
      activeKey.current = key;
      const next = readDraft(key);
      latest.current = next;
      setValue(next);
    }
  }, [key]);

  useEffect(() => {
    const id = setTimeout(() => writeDraft(activeKey.current, latest.current), 500);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(
    () => () => {
      writeDraft(activeKey.current, latest.current);
    },
    [],
  );

  const update = useCallback((v: string) => {
    latest.current = v;
    setValue(v);
  }, []);

  const clear = useCallback(() => {
    latest.current = "";
    setValue("");
    clearDraft(activeKey.current);
  }, []);

  return [value, update, clear];
}
