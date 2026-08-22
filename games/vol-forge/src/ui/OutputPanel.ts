import { Button } from '@volstudio/core';
import {
  collectSpriteDocIssues,
  isPresetCategory,
  type PresetCategory,
  type SpriteDoc,
} from '@volstudio/core/visual';
import { listOutputs, loadOutput } from '../io/forgeClient';
import { ChildScope, el, t } from './dom';

export type LoadSavedOutput = (category: PresetCategory, name: string, doc: SpriteDoc) => void;

/** Geliştirme sunucusundaki kayıtlı tarifleri listeler ve tek akışa geri açar. */
export class OutputPanel {
  readonly element: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly scope = new ChildScope();
  private readonly listScope = new ChildScope();

  constructor(private readonly onLoad: LoadSavedOutput) {
    this.element = el('div', 'vf-outputs');
    this.element.appendChild(
      this.scope.add(
        new Button(t('outputs.refresh'), {
          size: 'sm',
          fullWidth: false,
          onClick: () => this.refresh(),
        }),
      ).element,
    );
    this.status = el('div', 'vf-outputs__status');
    this.status.setAttribute('aria-live', 'polite');
    this.element.appendChild(this.status);
    this.list = el('div', 'vf-outputs__list');
    this.element.appendChild(this.list);
  }

  destroy(): void {
    this.listScope.clear();
    this.scope.clear();
    this.element.remove();
  }

  private async refresh(): Promise<void> {
    this.status.textContent = t('outputs.loading');
    this.listScope.clear();
    this.list.textContent = '';
    try {
      const listing = await listOutputs();
      const entries = Object.entries(listing.outputs).filter(([, names]) => names.length > 0);
      if (entries.length === 0) {
        this.status.textContent = t('outputs.empty');
        return;
      }
      this.status.textContent = '';
      for (const [category, names] of entries) {
        if (!isPresetCategory(category)) continue;
        const group = el('section', 'vf-outputs__group');
        group.appendChild(el('h3', 'vf-outputs__category', t(`category.${category}`)));
        for (const name of names) {
          group.appendChild(
            this.listScope.add(
              new Button(name, {
                size: 'sm',
                onClick: () => this.load(category, name),
              }),
            ).element,
          );
        }
        this.list.appendChild(group);
      }
    } catch (error) {
      this.status.textContent = t('outputs.fail', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async load(category: PresetCategory, name: string): Promise<void> {
    try {
      const doc = await loadOutput(`${category}/${name}.json`);
      const issues = collectSpriteDocIssues(doc);
      if (issues.length > 0) {
        this.status.textContent = t('outputs.invalid', { count: issues.length });
        return;
      }
      this.onLoad(category, name, doc);
      this.status.textContent = t('outputs.loaded', { name });
    } catch (error) {
      this.status.textContent = t('outputs.fail', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
