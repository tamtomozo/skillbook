const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);

export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedSet.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  pressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressedSet.has(c));
  }

  endFrame(): void {
    this.pressedSet.clear();
  }
}
