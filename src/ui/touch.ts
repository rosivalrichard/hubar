/* Touch controls for phones and tablets: left joystick (walk), drag anywhere else (look),
 * action buttons (examine, pick, crouch, pause). Feeds the same Input object as keyboard/mouse. */

import type { Input } from '../core/input';

export const IS_TOUCH =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0);

const LOOK_GAIN = 2.4; // touch pixels -> "mouse" pixels
const STICK_R = 52;

export class TouchControls {
  root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private crouchBtn: HTMLElement;
  private visible = false;

  constructor(
    private input: Input,
    private canvas: HTMLElement,
    private getState: () => string,
    private onInspectDrag: (dx: number, dy: number) => void
  ) {
    const root = document.createElement('div');
    root.className = 'touch-ui hidden';
    root.innerHTML = `
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button class="t-btn t-pause" data-k="KeyJ" aria-label="Pause">II</button>
        <button class="t-btn t-crouch" data-k="KeyC" data-toggle aria-label="Crouch">⤓</button>
        <button class="t-btn t-pick" data-k="KeyF">Pick</button>
        <button class="t-btn t-main" data-k="KeyE">Examine</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.stick = root.querySelector('.t-stick')!;
    this.knob = root.querySelector('.t-knob')!;
    this.crouchBtn = root.querySelector('.t-crouch')!;

    // joystick
    this.stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      const r = this.stick.getBoundingClientRect();
      this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.moveStick(e.clientX, e.clientY);
    });
    this.stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) this.moveStick(e.clientX, e.clientY);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.input.moveX = 0;
      this.input.moveY = 0;
      this.input.keys.delete('ShiftLeft');
      this.knob.style.transform = '';
    };
    this.stick.addEventListener('pointerup', endStick);
    this.stick.addEventListener('pointercancel', endStick);

    // buttons
    root.querySelectorAll<HTMLElement>('.t-btn').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = b.dataset.k!;
        if (b.hasAttribute('data-toggle')) {
          const on = !this.input.keys.has(code);
          if (on) this.input.keys.add(code);
          else this.input.keys.delete(code);
          b.classList.toggle('on', on);
          return;
        }
        this.input.press(code);
      });
    });

    // look / inspect drag on the canvas
    const lookable = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el === this.canvas || !!el.closest?.('#viewport, #hud-root'));
    };
    document.addEventListener(
      'touchstart',
      (e) => {
        if (this.lookId !== null || !lookable(e.target)) return;
        const t = e.changedTouches[0];
        this.lookId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      },
      { passive: true }
    );
    document.addEventListener(
      'touchmove',
      (e) => {
        if (this.lookId === null) return;
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.lookId) continue;
          const dx = t.clientX - this.lookLast.x;
          const dy = t.clientY - this.lookLast.y;
          this.lookLast = { x: t.clientX, y: t.clientY };
          const st = this.getState();
          if (st === 'playing') {
            this.input.mouseDX += dx * LOOK_GAIN;
            this.input.mouseDY += dy * LOOK_GAIN;
          } else if (st === 'inspect') {
            this.onInspectDrag(dx, dy);
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const endLook = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.lookId) this.lookId = null;
    };
    document.addEventListener('touchend', endLook);
    document.addEventListener('touchcancel', endLook);
  }

  private moveStick(x: number, y: number) {
    let dx = x - this.stickOrigin.x;
    let dy = y - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / STICK_R);
    this.input.moveX = dx / STICK_R;
    this.input.moveY = dy / STICK_R;
    // push the stick to the edge to run
    if (mag > 0.96 && !this.input.keys.has('KeyC')) this.input.keys.add('ShiftLeft');
    else this.input.keys.delete('ShiftLeft');
  }

  /** Called every frame. */
  update() {
    const show = this.getState() === 'playing';
    if (show === this.visible) return;
    this.visible = show;
    this.root.classList.toggle('hidden', !show);
    if (!show) {
      this.input.moveX = 0;
      this.input.moveY = 0;
      this.stickId = null;
      this.lookId = null;
      this.knob.style.transform = '';
      this.input.keys.delete('KeyC');
      this.input.keys.delete('ShiftLeft');
      this.crouchBtn.classList.remove('on');
    }
  }
}
