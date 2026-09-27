import { describe, it, expect } from 'vitest';
import { displayCapabilitiesForSession } from '../../src/platform/sessionDisplay';

describe('displayCapabilitiesForSession — gamescope görüntü yetenekleri', () => {
  it('gamescope oturumunda pencere kipi ve çözünürlük sunulmaz', () => {
    expect(displayCapabilitiesForSession('gamescope')).toEqual({
      windowMode: false,
      resolution: false,
    });
  });

  it('masaüstü ve web oturumunda iki kontrol de etkilidir', () => {
    const all = { windowMode: true, resolution: true };
    expect(displayCapabilitiesForSession('desktop')).toEqual(all);
    expect(displayCapabilitiesForSession('web')).toEqual(all);
    expect(displayCapabilitiesForSession('bilinmeyen')).toEqual(all);
  });
});
