import { useRef, useCallback, useEffect } from "react";

/**
 * 返回一个带防抖的函数和对应的 flush / clear。
 * const [debounced, flush, clear] = useDebouncedCallback(fn, 500);
 */
export function useDebouncedCallback(fn, delay) {
  const timer = useRef(null);
  const lastArgs = useRef(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const debounced = useCallback(
    (...args) => {
      lastArgs.current = args;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        fn(...lastArgs.current);
      }, delay);
    },
    [fn, delay]
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clear();
      if (lastArgs.current) fn(...lastArgs.current);
    }
  }, [fn]);

  useEffect(() => clear, []);

  return [debounced, flush, clear];
}
