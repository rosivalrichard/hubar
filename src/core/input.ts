/* Keyboard / mouse / pointer-lock input with edge detection. */

export class Input {
  keys = new Set<string>();
  private pressedKeys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
  locked = false;
  enabled = true;
  onLockChange: ((locked: boolean) => void) | null = null;
  onKeyDown: ((code: string) => void) | null = null;
  sensitivity = 1;
  invertY = false;

  private el: HTMLElement;
  private handlers: { target: EventTarget; type: string; fn: EventListener }[] = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const add = (target: EventTarget, type: string, fn: EventListener) => {
      target.addEventListener(type, fn);
      this.handlers.push({ target, type, fn });
    };

    add(window, 'keydown', ((e: KeyboardEvent) => {
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      this.onKeyDown?.(e.code);
    }) as EventListener);
    add(window, 'keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
    }) as EventListener);
    add(window, 'blur', (() => {
      this.keys.clear();
    }) as EventListener);
    add(el, 'mousedown', ((e: MouseEvent) => {
      if (this.locked && e.button === 0) {
        this.pressedKeys.add('Mouse0');
        this.keys.add('Mouse0');
      }
    }) as EventListener);
    add(window, 'mouseup', ((e: MouseEvent) => {
      if (e.button === 0) this.keys.delete('Mouse0');
    }) as EventListener);
    add(window, 'mousemove', ((e: MouseEvent) => {
      if (!this.locked || !this.enabled) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }) as EventListener);
    add(el, 'wheel', ((e: WheelEvent) => {
      if (!this.locked) return;
      this.wheelDelta += e.deltaY;
    }) as EventListener);
    add(el, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);

    add(document, 'pointerlockchange', (() => {
      this.locked = document.pointerLockElement === el;
      this.onLockChange?.(this.locked);
    }) as EventListener);
    add(document, 'pointerlockerror', (() => {
      this.locked = false;
      this.onLockChange?.(false);
    }) as EventListener);
  }

  requestLock() {
    if (document.pointerLockElement !== this.el) {
      const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  exitLock() {
    if (document.pointerLockElement === this.el) document.exitPointerLock?.();
  }

  isDown(code: string) {
    return this.keys.has(code);
  }

  wasPressed(code: string) {
    return this.pressedKeys.has(code);
  }

  takeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.pressedKeys.clear();
    this.wheelDelta = 0;
  }

  clear() {
    this.keys.clear();
    this.pressedKeys.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  dispose() {
    for (const h of this.handlers) h.target.removeEventListener(h.type, h.fn);
    this.handlers.length = 0;
  }
}
