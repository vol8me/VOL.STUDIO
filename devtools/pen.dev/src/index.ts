/**
 * pen.dev'in paket yüzeyi: bir tasarım export'unu DOĞRULAR ve tüketicisine
 * GÖNDERİR.
 *
 * Rig'i çalışma zamanında okuyan/montajlayan katman burada DEĞİLDİR; o
 * üretilmiş verinin sözleşmesidir ve `@volstudio/core/rig`de yaşar. Bu ayrım
 * bilinçlidir: bir oyunun çalışma zamanı, asset'ini üreten araca bağlanmaz
 * (bkz. AGENTS.md, "Bozulamaz Kurallar" 4).
 */
export {
  resolveRigExportPaths,
  auditRigExport,
  verifyRigExport,
  syncRigExport,
  auditShippedRig,
  type RigExportRef,
  type RigExportPaths,
  type RigExportAudit,
  type RigSyncRequest,
  type RigSyncReport,
} from './rigExport';
