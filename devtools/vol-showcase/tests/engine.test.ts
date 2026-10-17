import { describe, expect, it } from 'vitest';
import { detectEngine } from '../src/engine';

describe('detectEngine', () => {
  it('Steam Deck/Linux WebKitGTK kimliğini tanır', () => {
    expect(
      detectEngine(
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/60.5 Safari/605.1.15',
      ),
    ).toBe('webkitgtk');
  });

  it('Chromium, Android Chrome, Edge ve Apple Safari başka motordur', () => {
    const others = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137 Safari/537.36 Edg/137.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (Linux; x64) Gecko/20100101 Firefox/130.0',
    ];
    for (const ua of others) expect(detectEngine(ua)).toBe('other');
  });
});
