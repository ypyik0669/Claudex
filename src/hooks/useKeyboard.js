import { useEffect } from 'react';

/**
 * Global keyboard shortcut handler
 * Respects platform (Cmd on Mac, Ctrl on Windows/Linux)
 * Prevents conflicts with native shortcuts
 */
export function useKeyboard(shortcuts) {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? 'metaKey' : 'ctrlKey';

    function handleKeyDown(e) {
      // Don't interfere with input fields unless explicitly handled
      const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

      for (const shortcut of shortcuts) {
        const {
          key,
          ctrl = false,
          shift = false,
          alt = false,
          handler,
          allowInInput = false,
        } = shortcut;

        // Skip if in input field and not allowed
        if (isInput && !allowInInput) continue;

        // Check if all modifiers match
        const modMatch = ctrl ? e[modKey] : !e[modKey];
        const shiftMatch = shift ? e.shiftKey : !e.shiftKey;
        const altMatch = alt ? e.altKey : !e.altKey;
        const keyMatch = e.key.toLowerCase() === key.toLowerCase();

        if (modMatch && shiftMatch && altMatch && keyMatch) {
          e.preventDefault();
          e.stopPropagation();
          handler(e);
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}

/**
 * Format shortcut for display
 * @param {Object} shortcut - {key, ctrl, shift, alt}
 * @returns {string} - e.g. "Cmd+K" or "Ctrl+Shift+P"
 */
export function formatShortcut(shortcut) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts = [];

  if (shortcut.ctrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push(isMac ? 'Opt' : 'Alt');

  // Capitalize single letter keys
  const keyDisplay = shortcut.key.length === 1
    ? shortcut.key.toUpperCase()
    : shortcut.key;
  parts.push(keyDisplay);

  return parts.join('+');
}
