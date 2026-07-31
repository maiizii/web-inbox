import { useRef, useCallback, useEffect } from "react";

/**
 * 返回一个带防抖的函数和对应的 flush / clear。
 * const [debounced, flush, clear] = useDebouncedCallback(fn, 500);
 */
export function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  const pending = useRef(null);
  const latestFn = useRef(fn);
  latestFn.current = fn;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pending.current = null;
  }, []);

  const debounced = useCallback(
    (...args) => {
      clear();
      pending.current = { fn: latestFn.current, args };
      timer.current = setTimeout(() => {
        timer.current = null;
        const call = pending.current;
        pending.current = null;
        call?.fn(...call.args);
      }, delay);
    },
    [clear, delay]
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      const call = pending.current;
      pending.current = null;
      call?.fn(...call.args);
    }
  }, []);

  useEffect(() => clear, [clear]);

  return [debounced, flush, clear];
}
