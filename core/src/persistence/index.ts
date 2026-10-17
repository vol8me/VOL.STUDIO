export { AutosaveCoordinator, type AutosaveCoordinatorOptions } from './AutosaveCoordinator';
export {
  LocalStorageAdapter,
  SaveManager,
  StorageError,
  type IStorageAdapter,
} from './SaveManager';
export {
  PersistedObservableState,
  type PersistedObservableStateOptions,
  type PersistenceOperation,
  type PersistenceStore,
} from './PersistedObservableState';
export {
  isScopedKey,
  scopeOfKey,
  ScopedSaveManager,
  migrateLegacyStore,
  type KeyEnumerable,
  type LegacyKeyMapping,
  type MigrationReport,
  type ScopedKey,
  type ScopedStores,
  type StorageScope,
} from './scopedStorage';
