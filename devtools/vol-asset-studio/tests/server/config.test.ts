import { describe, expect, it } from 'vitest';
import { validateProjectConfig } from '../../server/config.js';
import { AssetStudioError } from '../../server/errors.js';

const valid = {
  schemaVersion: 1,
  name: 'Fixture',
  roots: [
    {
      id: 'images',
      path: 'public/assets',
      role: 'source',
      kinds: ['image', 'metadata'],
    },
  ],
  ignore: ['**/dist/**'],
};

describe('validateProjectConfig', () => {
  it('v1 yapılandırmasını kabul eder', () => {
    expect(validateProjectConfig(valid)).toEqual(valid);
  });

  it('bütün sorunlu alanları tek hatada toplar', () => {
    try {
      validateProjectConfig({
        schemaVersion: 2,
        roots: [
          { id: 'A!', path: '../escape', role: 'mutable', kinds: [] },
          { id: 'A!', path: '/absolute', role: 'source', kinds: ['image', 'image'] },
        ],
        ignore: 'dist',
        limits: { maxAssetBytes: -1, maxImagPixels: 4 },
        rootz: [],
      });
      expect.fail('hata bekleniyordu');
    } catch (error) {
      expect(error).toBeInstanceOf(AssetStudioError);
      expect((error as AssetStudioError).details?.issues).toEqual(
        expect.arrayContaining([
          'schemaVersion',
          'roots.0.id',
          'roots.0.path',
          'roots.0.role',
          'roots.0.kinds',
          'roots.1.id',
          'roots.1.path',
          'roots.1.kinds',
          'ignore',
          'limits.maxAssetBytes',
          'limits.maxImagPixels',
          'rootz',
        ]),
      );
    }
  });
});
