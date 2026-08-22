import { describe, it, expect } from 'vitest';
import {
  FIELD_KINDS,
  NODE_SCHEMAS,
  collectFieldIssues,
  resolveFieldDomain,
  type FieldNode,
} from '@volstudio/core/visual';
import {
  changeKind,
  defaultNode,
  extractChild,
  fieldParamNames,
  fillerFor,
  wrapNode,
  wrapperKinds,
} from '../../src/doc/defaults';

describe('şemadan varsayılan düğüm', () => {
  it('HER tür için geçerli bir düğüm kurulur', () => {
    for (const kind of FIELD_KINDS) {
      expect(collectFieldIssues(defaultNode(kind)), kind).toEqual([]);
    }
  });

  it('opsiyonel parametreler YAZILMAZ — belge diff"i okunur kalır', () => {
    const node = defaultNode('sdf.polygon') as unknown as Record<string, unknown>;
    expect(node.n).toBeDefined();
    expect(node.r).toBeDefined();
    // `center` ve `rotation` opsiyonel.
    expect('rotation' in node).toBe(false);
  });

  it('dolgu etki alanına göre seçilir', () => {
    expect(resolveFieldDomain(fillerFor('signed'))).toBe('signed');
    expect(resolveFieldDomain(fillerFor('unit'))).toBe('unit');
  });
});

describe('değiştir — tür değişir, alt ağaç korunur', () => {
  it('aynı adlı parametreler DEĞERİNİ korur', () => {
    const circle = { kind: 'sdf.circle', center: [0.3, -0.2], r: 0.4 } as unknown as FieldNode;
    const star = changeKind(circle, 'sdf.star') as unknown as Record<string, unknown>;

    expect(star.kind).toBe('sdf.star');
    expect(star.center).toEqual([0.3, -0.2]);
    // `r` yıldızda yok; yerine şemadan gelen rOuter/rInner.
    expect(star.rOuter).toBeDefined();
    expect(star.rInner).toBeDefined();
  });

  it('alan parametreleri de taşınır — alt ağaç kaybolmaz', () => {
    const blur = {
      kind: 'blur',
      radius: 0.05,
      input: { kind: 'noise.value', freq: 7 },
    } as unknown as FieldNode;
    const dilated = changeKind(blur, 'dilate') as unknown as Record<string, unknown>;

    expect(dilated.kind).toBe('dilate');
    expect(dilated.radius).toBe(0.05);
    expect(dilated.input).toEqual({ kind: 'noise.value', freq: 7 });
  });

  it('sonuç her zaman geçerlidir', () => {
    const source = defaultNode('sdf.circle');
    for (const kind of FIELD_KINDS) {
      expect(collectFieldIssues(changeKind(source, kind)), kind).toEqual([]);
    }
  });
});

describe('sar — boş yuva aynı etki alanında doldurulur', () => {
  it('sarmalayıcının ilk alan parametresi sarılanı alır', () => {
    const circle = defaultNode('sdf.circle');
    const wrapped = wrapNode(circle, 'blur') as unknown as Record<string, unknown>;
    expect(wrapped.kind).toBe('blur');
    expect(wrapped.input).toBe(circle);
  });

  it('İKİ girdili sarmalayıcıda kalan yuva GEÇERLİ bir dolgu alır', () => {
    // `min(sdf, ???)` — dolgu boş kalsa ağaç doğrulamadan düşerdi.
    const circle = defaultNode('sdf.circle');
    const wrapped = wrapNode(circle, 'min');
    expect(collectFieldIssues(wrapped)).toEqual([]);
    expect(resolveFieldDomain(wrapped)).toBe('signed');
  });

  it('birim bir alanı sarınca dolgu da BİRİM olur', () => {
    const noise = defaultNode('noise.value');
    const wrapped = wrapNode(noise, 'max');
    expect(collectFieldIssues(wrapped)).toEqual([]);
    expect(resolveFieldDomain(wrapped)).toBe('unit');
  });

  it('HER sarmalayıcı türü geçerli bir ağaç üretir', () => {
    const source = defaultNode('sdf.circle');
    for (const kind of wrapperKinds()) {
      expect(collectFieldIssues(wrapNode(source, kind)), kind).toEqual([]);
    }
  });

  it('alan parametresi olmayan tür sarmalayıcı olamaz', () => {
    expect(() => wrapNode(defaultNode('const'), 'const')).toThrow(/sarmalayıcı olamaz/);
    expect(wrapperKinds()).not.toContain('const');
    expect(wrapperKinds()).toContain('blur');
  });
});

describe('çıkar — çocuk yerine geçer', () => {
  it('tek girdili düğümde soru yoktur', () => {
    const inner = defaultNode('noise.value');
    const wrapped = wrapNode(inner, 'blur');
    expect(extractChild(wrapped, 'input')).toBe(inner);
  });

  it('iki girdili düğümde istenen çocuk seçilir', () => {
    const node = {
      kind: 'min',
      a: { kind: 'sdf.circle', r: 0.2 },
      b: { kind: 'sdf.box', half: [0.3, 0.3] },
    } as unknown as FieldNode;
    expect((extractChild(node, 'b') as unknown as Record<string, unknown>).kind).toBe('sdf.box');
  });

  it('olmayan alan sessizce geçmez', () => {
    expect(() => extractChild(defaultNode('const'), 'input')).toThrow(/alanı yok/);
  });

  it('alan parametre adları şemadan gelir', () => {
    expect(fieldParamNames(defaultNode('min')).sort()).toEqual(['a', 'b']);
    expect(fieldParamNames(defaultNode('blur'))).toEqual(['input']);
    expect(fieldParamNames(defaultNode('const'))).toEqual([]);
  });
});

describe('üç işlem birlikte TAM bir cebirdir', () => {
  it('sar sonra çıkar KİMLİKtir', () => {
    const original = defaultNode('sdf.box');
    for (const kind of wrapperKinds()) {
      const first = NODE_SCHEMAS[kind].params.find((param) => param.type === 'field')!;
      expect(extractChild(wrapNode(original, kind), first.name), kind).toBe(original);
    }
  });
});
