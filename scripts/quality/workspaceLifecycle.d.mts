/**
 * `workspaceLifecycle.mjs` için tip bildirimi.
 *
 * Betik bilinçli olarak düz `.mjs`: kalite bekçileri ve `workspace-contract`
 * onu build adımı olmadan, çıplak Node ile import edebilmelidir. TypeScript
 * tarafındaki tüketiciler (governance testleri) için tipler burada durur.
 */

export interface WorkspaceRecord {
  packageName: string;
  path: string;
  status: 'active' | 'frozen';
  freezeTag?: string;
  freezeCommit?: string;
  decisionDate?: string;
  reason?: string;
}

export interface WorkspaceLifecycle {
  schemaVersion?: number;
  workspaces: WorkspaceRecord[];
}

export interface WorkspacePackage {
  name: string;
  path: string;
  dir: string;
  scripts: Record<string, string>;
}

export declare function loadWorkspaceLifecycle(path: string): WorkspaceLifecycle;

/** Repo kökündeki `workspace-lifecycle.json`u okur; dosya yoksa `null` döner. */
export declare function loadRepoLifecycle(root: string): WorkspaceLifecycle | null;

export declare function activeWorkspaceNames(lifecycle: WorkspaceLifecycle): string[];
export declare function activeWorkspacePaths(lifecycle: WorkspaceLifecycle): string[];
export declare function frozenWorkspacePaths(lifecycle: WorkspaceLifecycle): string[];

/** Rutin ürün-kalitesi taramasından frozen ağaçları düşer; lifecycle yoksa seçimi daraltmaz. */
export declare function excludingFrozenPaths<T extends string>(
  files: T[],
  lifecycle: WorkspaceLifecycle | null,
): T[];

export declare function normalizeWorkspacePath(
  root: string,
  packagePath: string,
  pathModule?: unknown,
): string;
export declare function validWorkspacePath(
  root: string,
  pkgPath: string,
  pathModule?: unknown,
): boolean;
export declare function listWorkspacePackages(root?: string, pathModule?: unknown): WorkspacePackage[];
export declare function validateWorkspaceLifecycle(
  root: string,
  lifecycle: WorkspaceLifecycle,
  packages: WorkspacePackage[],
  pathModule?: unknown,
): string[];
