/**
 * axe bir öğeyi kimliğiyle adreslerse (`#vol-bar-label-5`) ve o kimlik bir ÖRNEK SAYACINDAN geliyorsa
 * (`Bar`, `ChargeButton`: `vol-<ad>-label-<n>`), kimlik öğenin kimliği değil sayfada o ana dek kaç
 * bileşen kurulduğudur: bir sekmeye bir çubuk eklemek, başka sekmelerdeki hiçbir şeyi değiştirmeden
 * kayıtlı bütün kimlikleri kaydırır. Kayıt bu yüzden sayaç hanesini taşımaz; kimlik ailesini adresler
 * (`[id^="vol-bar-label-"]`). Ölçüm (`finalContrast.spec.ts`) bu seçiciyle sekmedeki o ailenin HER
 * öğesini ölçer, yani sonradan eklenen çubuk da kayıtsız kalmaz, ölçümsüz de kalmaz.
 */
const COUNTER_ID = /#(vol-[a-z]+(?:-[a-z]+)*-label)-\d+(?![\w-])/g;

export function stableTarget(target: string): string {
  return target.replace(COUNTER_ID, '[id^="$1-"]');
}
