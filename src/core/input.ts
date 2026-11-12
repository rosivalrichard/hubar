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
  /** Analog movement from the touch joystick, -1..1 (moveY < 0 = forward). */
  moveX = 0;
  moveY = 0;
  /** Touch devices have no pointer lock: lock is emulated. */
  virtualLock = false;
  /** Desktop fallback when the browser refuses pointer lock (sandboxed preview, Chrome's re-lock cooldown
   *  right after Esc): play continues with a free cursor and you look around by dragging the mouse. */
  fallback = false;
  onFallback: (() => void) | null = null;

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
      if (e.code === 'Escape' && this.fallback && this.locked) {
        this.exitLock(); // no browser pointer lock to release, so Esc pauses through us
        return;
      }
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
      if (this.fallback && !e.buttons) return; // free cursor: look only while dragging
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    }) as EventListener);
    add(el, 'wheel', ((e: WheelEvent) => {
      if (!this.locked) return;
      this.wheelDelta += e.deltaY;
    }) as EventListener);
    add(el, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);

    add(document, 'pointerlockchange', (() => {
      const has = document.pointerLockElement === el;
      if (this.fallback) {
        if (has) this.fallback = false; // a late lock arrived: switch to normal mouse-look
        return;
      }
      this.locked = has;
      this.onLockChange?.(this.locked);
    }) as EventListener);
    add(document, 'pointerlockerror', (() => {
      // Previously this reported "unlocked", which re-opened the pause menu in an endless loop.
      this.enterFallback();
    }) as EventListener);
  }

  /** Synthetic key press (touch buttons). */
  press(code: string) {
    this.pressedKeys.add(code);
    this.onKeyDown?.(code);
  }

  requestLock() {
    if (this.virtualLock) {
      if (!this.locked) {
        this.locked = true;
        setTimeout(() => this.onLockChange?.(true), 0);
      }
      return;
    }
    if (document.pointerLockElement === this.el) return;
    if (this.fallback) {
      if (!this.locked) {
        this.locked = true;
        setTimeout(() => this.onLockChange?.(true), 0);
      }
      return;
    }
    this.wantLock = true;
    const fail = () => {
      if (!this.wantLock || document.pointerLockElement === this.el || this.fallback) return;
      this.enterFallback();
    };
    try {
      if (!this.el.requestPointerLock) return fail();
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(fail);
    } catch {
      fail();
    }
    window.setTimeout(fail, 500);
  }

  private enterFallback() {
    if (this.virtualLock) return;
    this.fallback = true;
    if (!this.locked) {
      this.locked = true;
      this.onLockChange?.(true);
    }
    this.onFallback?.();
  }

  private wantLock = false;

  exitLock() {
    this.wantLock = false;
    if (this.virtualLock || this.fallback) {
      this.fallback = false; // next resume tries a real pointer lock again
      if (this.locked) {
        this.locked = false;
        setTimeout(() => this.onLockChange?.(false), 0);
      }
      return;
    }
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
