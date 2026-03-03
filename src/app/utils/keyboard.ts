/**
 * Returns true when the event's target is an element where the user is
 * actively typing — an <input>, <textarea>, or any contentEditable node.
 *
 * Use this as an early-return guard in every global `window.addEventListener
 * ('keydown', …)` handler so that application-level shortcuts never swallow
 * native browser text-editing keys (Cmd+A, Cmd+C, arrows, Space, etc.).
 */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable ||
    // Walk up for nested contenteditable (e.g. draft-js, prosemirror, slate)
    target.closest('[contenteditable="true"]') !== null
  );
}
