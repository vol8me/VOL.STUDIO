import { describe, expect, it } from 'vitest';
import { TOOLS } from '../../src/config/game';
import { actionForKey, isTypingTarget } from '../../src/app/hotkeys';

describe('actionForKey', () => {
  it('1-6 tuşları araç tablosundaki sırayla araç seçer', () => {
    for (const tool of TOOLS)
      expect(actionForKey({ key: tool.hotkey })).toEqual({ type: 'tool', tool: tool.id });
  });

  it('r döndürür, Escape seçimi bırakır', () => {
    expect(actionForKey({ key: 'r' })).toEqual({ type: 'rotate' });
    expect(actionForKey({ key: 'R' })).toEqual({ type: 'rotate' });
    expect(actionForKey({ key: 'Escape' })).toEqual({ type: 'clear' });
  });

  it('değiştirici tuşlu basışlar tarayıcıya bırakılır', () => {
    expect(actionForKey({ key: 'r', ctrlKey: true })).toBeNull();
    expect(actionForKey({ key: '1', metaKey: true })).toBeNull();
    expect(actionForKey({ key: '2', altKey: true })).toBeNull();
  });

  it('tanınmayan tuş eylem üretmez', () => {
    expect(actionForKey({ key: 'x' })).toBeNull();
    expect(actionForKey({ key: '7' })).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('yazı alanlarını tanır', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('div'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
