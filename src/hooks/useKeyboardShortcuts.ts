import { useEffect } from 'react';

interface ShortcutHandlers {
  onSave?: () => void;
  onNextFile?: () => void;
  onPrevFile?: () => void;
  onNextDiff?: () => void;
  onSearch?: () => void;
  onPreview?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handlers.onSave?.();
        return;
      }

      if (isInput) return;

      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        handlers.onNextFile?.();
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlers.onPrevFile?.();
      } else if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        handlers.onNextDiff?.();
      } else if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        handlers.onSearch?.();
      } else if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        handlers.onPreview?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}