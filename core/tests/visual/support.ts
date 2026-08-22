import { FieldBufferPool } from '../../src/visual/field/buffer';
import { compileField, createCompileContext } from '../../src/visual/field/evaluate';
import { createUnitSpace } from '../../src/visual/field/space';
import type { FieldFn } from '../../src/visual/field/fn';
import type { FieldNode } from '../../src/visual/types';

export interface CompileTestOptions {
  width?: number;
  height?: number;
  seed?: number;
  tileable?: boolean;
  antialias?: boolean;
}

/**
 * Test için tek çağrıda derleme bağlamı kurar.
 *
 * Her çağrı KENDİ havuzunu alır; tamponlu düğümlerin tuttuğu tamponlar test
 * bitince çöpe gider. Üretimde bu tamponlar katman sonunda iade edilir
 * (`releaseCompiled`), ama testte havuzu paylaşmamak izolasyonu korur.
 */
export function compileTest(
  node: FieldNode,
  path = 'test',
  options: CompileTestOptions = {},
): FieldFn {
  const space = createUnitSpace(options.width ?? 64, options.height ?? 64);
  const context = createCompileContext(
    space,
    new FieldBufferPool(),
    options.seed ?? 4242,
    options.tileable ?? false,
    options.antialias ?? false,
  );
  return compileField(node, path, context);
}
