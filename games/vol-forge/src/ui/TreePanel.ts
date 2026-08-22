import { Button, Select, Tree, type TreeNodeDefinition } from '@volstudio/core';
import {
  FIELD_KINDS,
  NODE_SCHEMAS,
  resolveFieldDomain,
  type FieldKind,
  type FieldNode,
} from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import type { EditorState } from '../state/editorState';
import {
  changeKind,
  defaultNode,
  extractChild,
  fieldParamNames,
  wrapNode,
  wrapperKinds,
} from '../doc/defaults';
import { getAt, removeAt, setAt, type DocPath, type LayerField } from '../doc/path';
import { ChildScope, el, t } from './dom';

const FIELDS: LayerField[] = ['source', 'mask', 'height', 'materialMask'];

/**
 * Şekil ağacı — §8.5.
 *
 * Yapısal düzenleme ÜÇ işlemdir: değiştir, sar, çıkar. Şemadaki her `field`
 * parametresi zorunlu olduğu için "boş yuva" yoktur ve "çocuk ekle" işlemi
 * tanımsızdır; üçü birlikte her ağacı her ağaca dönüştürebilir.
 *
 * Eylemler satır başına değil SEÇİLİ düğüm üzerinde çalışır: yedi düğümlük
 * bir ağaçta satır başına dört düğme, okunmaz bir liste demekti.
 */
export class TreePanel {
  readonly element: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly actions: HTMLDivElement;
  private readonly scope = new ChildScope();
  private field: LayerField = 'source';

  constructor(
    private readonly store: DocumentStore,
    private readonly state: EditorState,
  ) {
    this.element = el('div', 'vf-tree');
    this.tabs = el('div', 'vf-tree__tabs');
    this.body = el('div', 'vf-tree__body');
    this.actions = el('div', 'vf-tree__actions');
    this.element.appendChild(this.tabs);
    this.element.appendChild(this.body);
    this.element.appendChild(this.actions);
  }

  render(): void {
    this.scope.clear();
    this.tabs.textContent = '';
    this.body.textContent = '';
    this.actions.textContent = '';

    const layerPath: DocPath = ['layers', this.state.selectedLayer];
    const layer = getAt(this.store.get(), layerPath);
    if (layer === undefined) return;

    for (const field of FIELDS) {
      const button = el('button', 'vf-tree__tab', t(`tree.${field}`));
      button.type = 'button';
      if (field === this.field) button.classList.add('vf-tree__tab--active');
      const defined = getAt(this.store.get(), [...layerPath, field]) != null;
      if (!defined) button.classList.add('vf-tree__tab--empty');
      button.addEventListener('click', () => {
        this.field = field;
        this.render();
      });
      this.tabs.appendChild(button);
    }

    const rootPath: DocPath = [...layerPath, this.field];
    const root = getAt(this.store.get(), rootPath);

    if (root == null) {
      this.body.appendChild(el('div', 'vf-tree__empty', t('tree.empty')));
      this.actions.appendChild(
        this.scope.add(
          new Button(t('tree.addField'), {
            size: 'sm',
            onClick: () => this.store.update((doc) => setAt(doc, rootPath, defaultNode('const'))),
          }),
        ).element,
      );
      return;
    }

    const tree = this.scope.add(
      new Tree([this.toTreeNode(root as FieldNode, rootPath)], {
        selectableFolders: true,
        onSelect: (id) => this.state.selectNode(decodePath(id)),
      }),
    );
    this.body.appendChild(tree.element);
    if (this.state.selectedNode) tree.select(encodePath(this.state.selectedNode));

    this.buildActions(rootPath);
  }

  destroy(): void {
    this.scope.clear();
    this.element.remove();
  }

  private toTreeNode(node: FieldNode, path: DocPath): TreeNodeDefinition {
    const children: TreeNodeDefinition[] = [];
    for (const param of NODE_SCHEMAS[node.kind].params) {
      if (param.type !== 'field') continue;
      const child = (node as unknown as Record<string, unknown>)[param.name];
      if (child == null) continue;
      children.push(this.toTreeNode(child as FieldNode, [...path, param.name]));
    }
    return {
      id: encodePath(path),
      label: `${node.kind}  ·  ${resolveFieldDomain(node)}`,
      expanded: true,
      children: children.length > 0 ? children : undefined,
    };
  }

  private buildActions(rootPath: DocPath): void {
    const selected = this.state.selectedNode ?? rootPath;
    const node = getAt(this.store.get(), selected) as FieldNode | undefined;
    if (!node) return;

    const replace = this.scope.add(
      new Select({
        options: FIELD_KINDS.map((kind) => ({ value: kind, label: kind })),
        value: node.kind,
        onChange: (value) =>
          this.store.update((doc) => setAt(doc, selected, changeKind(node, value as FieldKind))),
      }),
    );
    const wrap = this.scope.add(
      new Select({
        options: [
          { value: '', label: t('tree.wrap') },
          ...wrapperKinds().map((kind) => ({ value: kind, label: kind })),
        ],
        value: '',
        onChange: (value) => {
          if (value === '') return;
          this.store.update((doc) => setAt(doc, selected, wrapNode(node, value as FieldKind)));
        },
      }),
    );

    this.actions.appendChild(labelled(t('tree.replace'), replace.element));
    this.actions.appendChild(labelled(t('tree.wrap'), wrap.element));

    const params = fieldParamNames(node);
    if (params.length > 0) {
      const extract = this.scope.add(
        new Select({
          options: [
            { value: '', label: t('tree.extract') },
            ...params.map((param) => ({ value: param, label: param })),
          ],
          value: '',
          onChange: (value) => {
            if (value === '') return;
            this.store.update((doc) => setAt(doc, selected, extractChild(node, value)));
            this.state.selectNode(selected);
          },
        }),
      );
      this.actions.appendChild(labelled(t('tree.extractWhich'), extract.element));
    }

    // Kök `source` kaldırılamaz; katmanın kendisi ondan doğar.
    if (this.field !== 'source' && selected.length === rootPath.length) {
      this.actions.appendChild(
        this.scope.add(
          new Button(t('tree.removeField'), {
            variant: 'danger',
            size: 'sm',
            onClick: () => {
              this.store.update((doc) => removeAt(doc, rootPath));
              this.state.selectNode(null);
            },
          }),
        ).element,
      );
    }
  }
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  const wrap = el('div', 'vf-field');
  wrap.appendChild(el('span', 'vf-field__label', text));
  wrap.appendChild(control);
  return wrap;
}

export function encodePath(path: DocPath): string {
  return path.map((key) => String(key)).join('/');
}

export function decodePath(id: string): DocPath {
  return id.split('/').map((key) => (/^\d+$/.test(key) ? Number(key) : key));
}
