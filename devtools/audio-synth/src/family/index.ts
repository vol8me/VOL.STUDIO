/**
 * Genel ses ailesi üretimi (Dalga 5): `SoundFamilyProgramV1` şeması, genel rol
 * sözlüğü, adlı alt akışlarla deterministik genişletme ve `SoundFamilyBankV1`
 * çalışma zamanı sözleşmesi. Yayın akışı `src/protocol/family.ts`dedir.
 */
export {
  BANK_CHOICE_METHOD,
  BANK_LOOKUP_CONTRACT,
  chooseVariant,
  filterVariants,
  fnv1a32,
  SOUND_FAMILY_BANK_SCHEMA,
  validateBank,
} from './bank';
export type { BankQuery, BankVariantV1, SoundFamilyBankV1 } from './bank';
export {
  expandFamily,
  FAMILY_ID,
  FAMILY_VARIATION_POLICY,
  familyHash,
  ROLE_AXES,
  SOUND_FAMILY_SCHEMA,
  validateFamilyProgram,
  variantIdOf,
} from './program';
export type {
  ExpandedVariant,
  FamilyDeliveryV1,
  FamilyDimensionV1,
  FamilyVariantV1,
  RoleAxis,
  RoleConstraintV1,
  SoundFamilyProgramV1,
} from './program';
