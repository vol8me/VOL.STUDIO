import { collectSpriteDocIssues } from '@volstudio/core/visual';
import type { DocumentStore } from '../state/DocumentStore';
import type { EditorState } from '../state/editorState';
import { pathFromIssue } from '../doc/path';
import { el, t } from './dom';

/**
 * Canlı doğrulama — §8.10.
 *
 * `collectSpriteDocIssues` her değişimde koşar; mikrosaniyeler sürer.
 * Doğrulayıcının her sorunu YOL ile döndürmesinin asıl tüketicisi burasıdır:
 * yol, seçime çevrilir.
 */
export class IssuePanel {
  readonly element: HTMLDivElement;
  private issues: string[] = [];

  constructor(
    private readonly store: DocumentStore,
    private readonly state: EditorState,
  ) {
    this.element = el('div', 'vf-issues');
  }

  get hasIssues(): boolean {
    return this.issues.length > 0;
  }

  render(): void {
    this.issues = collectSpriteDocIssues(this.store.get());
    this.element.textContent = '';

    if (this.issues.length === 0) {
      this.element.appendChild(el('div', 'vf-issues__ok', t('issues.none')));
      return;
    }

    this.element.appendChild(
      el('div', 'vf-issues__count', t('issues.count', { count: this.issues.length })),
    );
    for (const issue of this.issues) {
      const row = el('button', 'vf-issues__row', issue);
      row.type = 'button';
      row.addEventListener('click', () => {
        const path = pathFromIssue(issue);
        // Yolun ilk iki parçası katmanı verir; geri kalanı düğümü.
        if (path[0] === 'layers' && typeof path[1] === 'number') {
          this.state.selectLayer(path[1]);
          if (path.length > 2) this.state.selectNode(path);
        }
      });
      this.element.appendChild(row);
    }
  }

  destroy(): void {
    this.element.remove();
  }
}
