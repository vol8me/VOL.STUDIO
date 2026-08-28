import { describe, it, expect } from 'vitest';
import { FIELD_KINDS, NODE_SCHEMAS } from '../src/schema';
import { collectFieldIssues } from '../src/validate';
import { compileTest } from './support';
import type { FieldNode } from '../src/types';

/**
 * Şema, doğrulayıcı ve derleyici AYNI düğüm kümesini tanımalı.
 *
 * Üçü ayrışırsa hata biçimi sinsi olur: şemaya girmiş ama derlenmeyen bir
 * tür doğrulamadan geçer ve çalışma anında patlar; derlenip şemaya girmemiş
 * bir tür ise doğrulamada "bilinmeyen tür" der. Bu bekçi ikisini de kapatır.
 */
describe('şema bütünlüğü (D11)', () => {
  it('her kayıt kendi anahtarıyla aynı türü bildirir', () => {
    for (const [key, schema] of Object.entries(NODE_SCHEMAS)) {
      expect(schema.kind).toBe(key);
    }
    expect(FIELD_KINDS).toEqual(Object.keys(NODE_SCHEMAS));
  });

  it('her parametre açıklamalıdır — editör kontrolü buradan üretilir', () => {
    for (const schema of Object.values(NODE_SCHEMAS)) {
      expect(schema.description.length).toBeGreaterThan(0);
      for (const param of schema.params) {
        expect(param.description.length, `${schema.kind}.${param.name}`).toBeGreaterThan(0);
        if (param.range) expect(param.range[0]).toBeLessThan(param.range[1]);
      }
    }
  });

  it('sayısal parametrelerin varsayılanı kendi kısıtını sağlar', () => {
    for (const schema of Object.values(NODE_SCHEMAS)) {
      for (const param of schema.params) {
        if (param.default === undefined) continue;
        const values = Array.isArray(param.default) ? param.default : [param.default];
        for (const value of values) {
          if (typeof value !== 'number') continue;
          const label = `${schema.kind}.${param.name}`;
          if (param.constraint === 'positive') expect(value, label).toBeGreaterThan(0);
          if (param.constraint === 'nonNegative') expect(value, label).toBeGreaterThanOrEqual(0);
          if (param.constraint === 'nonZero') expect(value, label).not.toBe(0);
          if (param.constraint === 'unit') {
            expect(value, label).toBeGreaterThanOrEqual(0);
            expect(value, label).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  /** Şemadan varsayılanlarla bir düğüm kurar; `field` parametreleri sabitle doldurulur. */
  function buildDefault(kind: string): Record<string, unknown> {
    const node: Record<string, unknown> = { kind };
    for (const param of NODE_SCHEMAS[kind as keyof typeof NODE_SCHEMAS].params) {
      if (param.type === 'field') {
        node[param.name] = { kind: 'const', value: 0.5 };
        continue;
      }
      const fallback = param.default;
      if (fallback !== undefined) {
        node[param.name] = Array.isArray(fallback) ? (fallback as unknown[]).slice() : fallback;
      } else if (!param.optional) {
        throw new Error(`${kind}.${param.name}: zorunlu parametrenin varsayılanı yok`);
      }
    }
    return node;
  }

  it('şemadaki varsayılanlarla kurulan her düğüm DOĞRULAMADAN geçer', () => {
    for (const kind of FIELD_KINDS) {
      expect(collectFieldIssues(buildDefault(kind)), kind).toEqual([]);
    }
  });

  it('şemadaki her düğüm DERLENİR ve sonlu bir değer üretir', () => {
    for (const kind of FIELD_KINDS) {
      const field = compileTest(buildDefault(kind) as unknown as FieldNode, kind);
      for (const [x, y] of [
        [0, 0],
        [0.7, -0.3],
        [-1, 1],
      ]) {
        expect(Number.isFinite(field(x, y)), `${kind} @ ${x},${y}`).toBe(true);
      }
    }
  });

  it('derleyici şemada olmayan bir türü sessizce geçmez', () => {
    expect(() => compileTest({ kind: 'yok' } as unknown as FieldNode, 'x')).toThrow(/Derlenemeyen/);
  });
});
