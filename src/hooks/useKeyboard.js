import { useEffect } from 'react';

/**
 * 全局键盘快捷键处理器。
 * 按平台区分 Mac 的 Cmd 和 Windows/Linux 的 Ctrl，并避免覆盖原生快捷键。
 */
export function useKeyboard(shortcuts) {
  useEffect(() => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? 'metaKey' : 'ctrlKey';

    function handleKeyDown(e) {
      // 除非快捷键显式允许，否则不干扰输入框。
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

        // 输入框内默认跳过，避免影响正常输入。
        if (isInput && !allowInInput) continue;

        // 检查所有修饰键是否匹配。
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
 * 格式化快捷键显示文本。
 * @param {Object} shortcut - {key, ctrl, shift, alt}
 * @returns {string} - 例如 "Cmd+K" 或 "Ctrl+Shift+P"
 */
export function formatShortcut(shortcut) {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const parts = [];

  if (shortcut.ctrl) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push(isMac ? 'Opt' : 'Alt');

  // 单字母按键使用大写显示。
  const keyDisplay = shortcut.key.length === 1
    ? shortcut.key.toUpperCase()
    : shortcut.key;
  parts.push(keyDisplay);

  return parts.join('+');
}
