export interface TreeNodeDefinition {
  id: string;
  label: string;
  children?: TreeNodeDefinition[];
  /** Başlangıçta geniş. Yalnızca alt düğüm varsa anlamlı. Varsayılan false. */
  expanded?: boolean;
  /** Etiketin solundaki ikon (svgIcon() veya emoji/Node). Verilmezse boş. */
  icon?: string | Node;
  /** Düğümü tıklanamaz/seçilemez yapar (ör. kilitli envanter slotu). */
  disabled?: boolean;
}

export interface TreeOptions {
  onSelect?: (id: string) => void;
  /** true ise klasör düğümüne tıklamak hem aç/kapa yapar hem seçer. Varsayılan false (yalnızca aç/kapa). */
  selectableFolders?: boolean;
  /** true ise her düğümde checkbox gösterir; `onSelect` yerine `onSelectionChange` ile bağımsız çoklu seçim. Varsayılan false (select() ile tekli seçim). */
  multiSelect?: boolean;
  onSelectionChange?: (ids: string[]) => void;
}

interface FlatNode {
  id: string;
  row: HTMLDivElement;
  hasChildren: boolean;
  disabled: boolean;
  depth: number;
}

/**
 * Ebeveyn-çocuk ağaç görünümü (`role="tree"` / `role="treeitem"`,
 * `aria-expanded`/`aria-selected`). Tam WAI-ARIA klavye navigasyonu:
 * ArrowUp/Down görünür düğümler arası, ArrowRight açar/iner, ArrowLeft
 * kapatır/yükselir, Home/End liste uçlarına atlar.
 */
export class Tree {
  readonly element: HTMLUListElement;
  private readonly onSelectHandler?: (id: string) => void;
  private readonly onSelectionChangeHandler?: (ids: string[]) => void;
  private readonly selectableFolders: boolean;
  private readonly multiSelect: boolean;
  private selectedId: string | null = null;
  private readonly selectedIds = new Set<string>();
  private readonly itemElements = new Map<string, HTMLLIElement>();
  private readonly flatOrder: FlatNode[] = [];
  private readonly rowCleanups: (() => void)[] = [];

  constructor(nodes: TreeNodeDefinition[], options: TreeOptions = {}) {
    this.onSelectHandler = options.onSelect;
    this.onSelectionChangeHandler = options.onSelectionChange;
    this.selectableFolders = options.selectableFolders ?? false;
    this.multiSelect = options.multiSelect ?? false;

    this.element = document.createElement('ul');
    this.element.className = 'vol-tree';
    this.element.setAttribute('role', 'tree');
    if (this.multiSelect) {
      this.element.setAttribute('aria-multiselectable', 'true');
    }

    for (const node of nodes) {
      this.element.appendChild(this.buildNode(node, 0));
    }

    this.refreshFlatOrder();
    this.setInitialTabStop();
  }

  select(id: string): void {
    if (this.multiSelect) {
      this.toggleSelection(id);
      return;
    }

    const previous = this.selectedId ? this.itemElements.get(this.selectedId) : undefined;
    previous?.querySelector(':scope > .vol-tree__row')?.setAttribute('aria-selected', 'false');
    previous?.querySelector(':scope > .vol-tree__row')?.classList.remove('vol-tree__row--selected');

    this.selectedId = id;
    const next = this.itemElements.get(id);
    const row = next?.querySelector(':scope > .vol-tree__row');
    row?.setAttribute('aria-selected', 'true');
    row?.classList.add('vol-tree__row--selected');
  }

  /** multiSelect:true iken işaretli düğüm id'leri. */
  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  destroy(): void {
    for (const cleanup of this.rowCleanups) {
      cleanup();
    }
    this.element.remove();
  }

  private toggleSelection(id: string): void {
    const item = this.itemElements.get(id);
    const row = item?.querySelector<HTMLDivElement>(':scope > .vol-tree__row');
    if (!row) return;

    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
      row.setAttribute('aria-selected', 'false');
      row.classList.remove('vol-tree__row--selected');
    } else {
      this.selectedIds.add(id);
      row.setAttribute('aria-selected', 'true');
      row.classList.add('vol-tree__row--selected');
    }
    this.onSelectionChangeHandler?.(this.getSelectedIds());
  }

  private buildNode(node: TreeNodeDefinition, depth: number): HTMLLIElement {
    const hasChildren = Boolean(node.children && node.children.length > 0);
    const item = document.createElement('li');
    item.className = 'vol-tree__item';
    item.setAttribute('role', 'treeitem');
    if (hasChildren) {
      item.setAttribute('aria-expanded', String(node.expanded ?? false));
    }
    this.itemElements.set(node.id, item);

    const row = document.createElement('div');
    row.className = 'vol-tree__row';
    row.style.setProperty('--vol-tree-depth', String(depth));
    row.setAttribute('aria-selected', 'false');
    row.tabIndex = -1;
    if (node.disabled) {
      row.classList.add('vol-tree__row--disabled');
      row.setAttribute('aria-disabled', 'true');
    }

    const caret = document.createElement('span');
    caret.className = 'vol-tree__caret';
    caret.textContent = hasChildren ? '▸' : '';
    row.appendChild(caret);

    if (this.multiSelect) {
      const checkbox = document.createElement('span');
      checkbox.className = 'vol-tree__checkbox';
      row.appendChild(checkbox);
    }

    if (node.icon) {
      const iconSlot = document.createElement('span');
      iconSlot.className = 'vol-tree__icon';
      if (typeof node.icon === 'string') {
        iconSlot.textContent = node.icon;
      } else {
        iconSlot.appendChild(node.icon);
      }
      row.appendChild(iconSlot);
    }

    const label = document.createElement('span');
    label.className = 'vol-tree__label';
    label.textContent = node.label;
    row.appendChild(label);

    // Alt liste DOM'da kalır; görünürlük CSS class ile aç/kapa yapılır (grid-template-rows
    // 0fr<->1fr, Accordion'ın paneliyle aynı teknik) — animasyonlu olabilir. `vol-tree__children-outer`
    // sarmalayıcısı grid item'ın min-height:0'a çökmesine izin verir.
    let childListOuter: HTMLDivElement | null = null;
    let childList: HTMLUListElement | null = null;
    if (hasChildren) {
      childListOuter = document.createElement('div');
      childListOuter.className = 'vol-tree__children-outer';

      childList = document.createElement('ul');
      childList.className = 'vol-tree__children';
      for (const child of node.children ?? []) {
        childList.appendChild(this.buildNode(child, depth + 1));
      }
      childListOuter.appendChild(childList);
      if (node.expanded) childListOuter.classList.add('vol-tree__children-outer--open');
    }

    const setExpanded = (expanded: boolean): void => {
      if (!hasChildren || !childListOuter) return;
      item.setAttribute('aria-expanded', String(expanded));
      childListOuter.classList.toggle('vol-tree__children-outer--open', expanded);
      caret.classList.toggle('vol-tree__caret--open', expanded);
      // Hemen çağrılabilir — görünürlük zaten class ile belirlidir, CSS geçişinin
      // bitmesi beklenmez.
      this.refreshFlatOrder();
    };

    const toggleExpanded = (): void => {
      if (!hasChildren) return;
      const expanded = item.getAttribute('aria-expanded') === 'true';
      setExpanded(!expanded);
    };

    // Satıra tıklamak klasör düğümünü hem aç/kapa yapar hem seçer (standart ağaç
    // görünümü davranışı — VS Code gezgini, OS dosya yöneticileri). Caret kendi
    // tıklama hedefini korur (aşağıdaki onCaretClick) — seçimi değiştirmeden
    // aç/kapa yapmak isteyenler için.
    const activate = (): void => {
      if (node.disabled) return;
      if (hasChildren) {
        toggleExpanded();
      }
      if (!hasChildren || this.selectableFolders) {
        this.select(node.id);
        this.onSelectHandler?.(node.id);
      }
    };

    const onCaretClick = (event: MouseEvent): void => {
      event.stopPropagation();
      toggleExpanded();
    };
    if (hasChildren) {
      caret.addEventListener('click', onCaretClick);
    }

    const onClick = (event: MouseEvent): void => {
      event.stopPropagation();
      activate();
    };

    const onKeydown = (event: KeyboardEvent): void =>
      this.handleKeydown(event, node.id, hasChildren, setExpanded, activate);

    row.addEventListener('click', onClick);
    row.addEventListener('keydown', onKeydown);
    this.rowCleanups.push(() => {
      row.removeEventListener('click', onClick);
      row.removeEventListener('keydown', onKeydown);
      if (hasChildren) caret.removeEventListener('click', onCaretClick);
    });

    if (node.expanded) {
      caret.classList.add('vol-tree__caret--open');
    }

    item.appendChild(row);
    if (childListOuter) {
      item.appendChild(childListOuter);
    }

    return item;
  }

  private handleKeydown(
    event: KeyboardEvent,
    id: string,
    hasChildren: boolean,
    setExpanded: (expanded: boolean) => void,
    activate: () => void,
  ): void {
    const item = this.itemElements.get(id);
    if (!item) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        activate();
        return;
      case 'ArrowDown': {
        event.preventDefault();
        this.focusRelative(id, 1);
        return;
      }
      case 'ArrowUp': {
        event.preventDefault();
        this.focusRelative(id, -1);
        return;
      }
      case 'ArrowRight': {
        if (!hasChildren) return;
        event.preventDefault();
        const expanded = item.getAttribute('aria-expanded') === 'true';
        if (!expanded) {
          setExpanded(true);
        } else {
          this.focusRelative(id, 1);
        }
        return;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        const expanded = hasChildren && item.getAttribute('aria-expanded') === 'true';
        if (expanded) {
          setExpanded(false);
        } else {
          this.focusParent(id);
        }
        return;
      }
      case 'Home': {
        event.preventDefault();
        this.focusIndex(0);
        return;
      }
      case 'End': {
        event.preventDefault();
        this.focusIndex(this.flatOrder.length - 1);
        return;
      }
      default:
        return;
    }
  }

  /** Ağaç yapısı değiştikten sonra klavye navigasyonu için görünür düğüm sırasını yeniden hesaplar. */
  private refreshFlatOrder(): void {
    this.flatOrder.length = 0;
    const walk = (ul: HTMLUListElement): void => {
      for (const li of Array.from(ul.children) as HTMLLIElement[]) {
        const row = li.querySelector<HTMLDivElement>(':scope > .vol-tree__row');
        if (!row) continue;
        const id = [...this.itemElements.entries()].find(([, el]) => el === li)?.[0];
        if (!id) continue;
        const hasChildren =
          li.getAttribute('role') === 'treeitem' && li.hasAttribute('aria-expanded');
        this.flatOrder.push({
          id,
          row,
          hasChildren,
          disabled: row.classList.contains('vol-tree__row--disabled'),
          depth: Number(row.style.getPropertyValue('--vol-tree-depth')) || 0,
        });
        const childListOuter = li.querySelector<HTMLDivElement>(
          ':scope > .vol-tree__children-outer',
        );
        const childList = childListOuter?.querySelector<HTMLUListElement>(
          ':scope > .vol-tree__children',
        );
        if (childList && childListOuter?.classList.contains('vol-tree__children-outer--open')) {
          walk(childList);
        }
      }
    };
    walk(this.element);
  }

  private setInitialTabStop(): void {
    const first = this.flatOrder[0];
    if (first) first.row.tabIndex = 0;
  }

  private focusIndex(index: number): void {
    const target = this.flatOrder[index];
    if (!target) return;
    for (const node of this.flatOrder) node.row.tabIndex = -1;
    target.row.tabIndex = 0;
    target.row.focus();
  }

  private focusRelative(fromId: string, delta: 1 | -1): void {
    const index = this.flatOrder.findIndex((n) => n.id === fromId);
    if (index === -1) return;
    this.focusIndex(index + delta);
  }

  private focusParent(id: string): void {
    const item = this.itemElements.get(id);
    const parentList = item?.parentElement;
    const parentItem = parentList?.closest('li.vol-tree__item');
    if (!parentItem) return;
    const parentId = [...this.itemElements.entries()].find(([, el]) => el === parentItem)?.[0];
    if (parentId) {
      const index = this.flatOrder.findIndex((n) => n.id === parentId);
      if (index !== -1) this.focusIndex(index);
    }
  }
}
