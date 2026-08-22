import {
  Checkbox,
  CurveEditor,
  NumberStepper,
  Select,
  Slider,
  type CurvePoint,
} from '@volstudio/core';
import {
  NODE_SCHEMAS,
  resolveFieldDomain,
  type FieldNode,
  type ParamSchema,
} from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import type { EditorState } from '../state/editorState';
import { defaultNode } from '../doc/defaults';
import { getAt, removeAt, setAt, type DocPath } from '../doc/path';
import { ChildScope, el, nodeDescription, paramLabel, t } from './dom';

/**
 * Parametre paneli — §8.6. Kontroller ŞEMADAN üretilir; kırk küsur
 * primitifin parametrelerini elle bağlamak sürdürülemez.
 *
 * `field` parametreleri burada DÜZENLENMEZ: bir bağlantı olarak görünür ve
 * tıklandığında o çocuğu seçer. Aksi hâlde aynı işi yapmanın iki yolu olurdu
 * — ağaç yapıyı, panel sayıları yönetir.
 */
export class ParamPanel {
  readonly element: HTMLDivElement;
  private readonly scope = new ChildScope();

  constructor(
    private readonly store: DocumentStore,
    private readonly state: EditorState,
  ) {
    this.element = el('div', 'vf-params');
  }

  render(): void {
    this.scope.clear();
    this.element.textContent = '';

    const path = this.state.selectedNode;
    if (!path) {
      this.element.appendChild(el('div', 'vf-params__empty', t('tree.empty')));
      return;
    }
    const node = getAt(this.store.get(), path) as FieldNode | undefined;
    if (!node) return;

    const header = el('div', 'vf-params__header');
    header.appendChild(el('span', 'vf-params__kind', node.kind));
    header.appendChild(
      el('span', 'vf-badge vf-badge--info', `${t('param.domain')}: ${resolveFieldDomain(node)}`),
    );
    this.element.appendChild(header);

    const schema = NODE_SCHEMAS[node.kind];
    this.element.appendChild(el('div', 'vf-params__desc', nodeDescription(node.kind)));

    for (const param of schema.params) {
      this.element.appendChild(this.buildParam(path, node, param));
    }
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private buildParam(path: DocPath, node: FieldNode, param: ParamSchema): HTMLElement {
    const wrap = el('div', 'vf-field');
    const paramPath: DocPath = [...path, param.name];
    const raw = (node as unknown as Record<string, unknown>)[param.name];

    const head = el('div', 'vf-field__head');
    const label = el('span', 'vf-field__label', param.name);
    // Etiket parametrenin ADIdır (belgede de öyle yazılır); açıklama
    // ipucunda durur ve i18n'den gelir (§8.13).
    label.title = paramLabel(node.kind, param.name);
    head.appendChild(label);

    if (param.optional) {
      // Anahtar kapalıyken alan belgeden TAMAMEN çıkar; her varsayılanı
      // açıkça yazan bir belge diff'te okunmaz hâle gelir (§8.6).
      const toggle = this.scope.add(
        new Checkbox({
          label: t('param.useDefault'),
          checked: raw === undefined,
          onChange: (checked) => {
            this.store.update((doc) =>
              checked ? removeAt(doc, paramPath) : setAt(doc, paramPath, defaultValueFor(param)),
            );
          },
        }),
      );
      head.appendChild(toggle.element);
    }
    wrap.appendChild(head);

    if (param.optional && raw === undefined) return wrap;

    const commit = (value: unknown): void => {
      this.store.update((doc) => setAt(doc, paramPath, value), {
        coalesceKey: `${paramPath.join('/')}`,
      });
    };

    switch (param.type) {
      case 'number':
      case 'int': {
        const [min, max] = param.range ?? [0, 1];
        const control = this.scope.add(
          param.type === 'int'
            ? new NumberStepper({
                min,
                max,
                step: param.step ?? 1,
                value: Number(raw ?? 0),
                onChange: commit,
              })
            : new Slider({
                min,
                max,
                step: param.step ?? 0.01,
                value: Number(raw ?? 0),
                formatValue: (value) => value.toFixed(3),
                onChange: commit,
              }),
        );
        wrap.appendChild(control.element);
        break;
      }
      case 'bool': {
        const control = this.scope.add(new Checkbox({ checked: raw === true, onChange: commit }));
        wrap.appendChild(control.element);
        break;
      }
      case 'enum': {
        const control = this.scope.add(
          new Select({
            options: (param.options ?? []).map((option) => ({ value: option, label: option })),
            value: typeof raw === 'string' ? raw : param.options?.[0] ?? '',
            onChange: commit,
          }),
        );
        wrap.appendChild(control.element);
        break;
      }
      case 'vec2': {
        const pair = Array.isArray(raw) ? (raw as number[]) : [0, 0];
        const [min, max] = param.range ?? [-2, 2];
        for (const axis of [0, 1]) {
          const control = this.scope.add(
            new Slider({
              min,
              max,
              step: param.step ?? 0.01,
              value: pair[axis] ?? 0,
              label: axis === 0 ? 'x' : 'y',
              formatValue: (value) => value.toFixed(3),
              onChange: (value) => {
                const next = [...pair];
                next[axis] = value;
                commit(next);
              },
            }),
          );
          wrap.appendChild(control.element);
        }
        break;
      }
      case 'points': {
        const control = this.scope.add(
          new CurveEditor({
            points: (Array.isArray(raw) ? raw : []) as CurvePoint[],
            onChange: (points) => commit(points.map((point) => [point[0], point[1]])),
          }),
        );
        wrap.appendChild(control.element);
        break;
      }
      case 'field': {
        const link = el('button', 'vf-field__link', t('param.childLink'));
        link.type = 'button';
        link.addEventListener('click', () => this.state.selectNode(paramPath));
        wrap.appendChild(link);
        break;
      }
      default:
        break;
    }

    return wrap;
  }
}

function defaultValueFor(param: ParamSchema): unknown {
  if (param.type === 'field') return defaultNode('const');
  if (param.default !== undefined) {
    return Array.isArray(param.default) ? (param.default as unknown[]).slice() : param.default;
  }
  if (param.type === 'enum') return param.options?.[0];
  return 0;
}
