import { useCallback, useEffect, useRef, useState } from 'react';

const MODAL_EXIT_MS = 190;

export function useModalLifecycle(isOpen: boolean, onClose: () => void) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();

    if (isOpen) {
      // The modal lifecycle intentionally mirrors the external isOpen flag.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldRender(true);
      window.requestAnimationFrame(() => setIsClosing(false));
      return;
    }

    if (shouldRender) {
      setIsClosing(true);
      timerRef.current = window.setTimeout(() => {
        setShouldRender(false);
        timerRef.current = null;
      }, MODAL_EXIT_MS);
    }

    return clearTimer;
  }, [clearTimer, isOpen, shouldRender]);

  const requestClose = useCallback(() => {
    if (isClosing) return;

    clearTimer();
    setIsClosing(true);
    timerRef.current = window.setTimeout(() => {
      setShouldRender(false);
      timerRef.current = null;
      onClose();
    }, MODAL_EXIT_MS);
  }, [clearTimer, isClosing, onClose]);

  return { shouldRender, isClosing, requestClose };
}
