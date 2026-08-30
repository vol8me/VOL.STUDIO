import type { RigMetadata } from '@volstudio/pen.dev';
import arachnidMetadataRaw from '../../../../devtools/pen.dev/pen_export/enemies/arachnid/metadata/arachnid.metadata.json';

// JSON import'unun `schemaVersion` alanı TS'de genel `number` çıkarılır;
// `RigMetadata` `1` literal tipini bekler. Şeklin gerçek geçerliliği zaten
// `buildRigDefinition` içindeki `validateRigMetadata` ile ÇALIŞMA ZAMANINDA
// doğrulanıyor — bu yalnız derleme zamanı literal-tip uyuşmazlığını giderir.
const arachnidMetadata = arachnidMetadataRaw as RigMetadata;

const arachnidPartUrls = import.meta.glob(
  '../../../../devtools/pen.dev/pen_export/enemies/arachnid/parts/*.png',
  { eager: true, query: '?url', import: 'default' },
);

export { arachnidMetadata, arachnidPartUrls };
