/**
 * Copy text to clipboard. Works in HTTP (non-secure) contexts by falling back
 * to execCommand when navigator.clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to fallback */
    }
  }
  if (typeof document.queryCommandSupported === 'function' && document.queryCommandSupported('copy')) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    document.body.appendChild(el);
    el.select();
    try {
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch {
      document.body.removeChild(el);
    }
  }
  return false;
}
