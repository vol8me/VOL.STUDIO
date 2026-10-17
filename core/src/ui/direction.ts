/**
 * Yazı yönü (UI-07.2): yatay ok tuşu, kaydırma ve sütun/slayt sırası fiziksel değil MANTIKSAL ileridir.
 * Yön, en yakın `dir` özniteliğinden okunur (belge köküne `dir="rtl"` konur; iç içe `dir="ltr"` kazanır).
 *
 * Kural: sırası okuma yönünü izleyen yapılar (sekme/araç çubuğu/slayt/sütun/ızgara/ağaç) RTL'de aynalanır ve
 * sağ ok "geri" gider. Okuma yönünden bağımsız FİZİKSEL denetimler — kaydırıcı, kart destesi, mini harita
 * kaydırması, joystick — aynalanmaz ve ok tuşu fiziksel yönü izler.
 */
export function isRtl(element: Element): boolean {
  return element.closest('[dir]')?.getAttribute('dir') === 'rtl';
}

/** Yatay mantıksal ilerleme işareti: LTR'de +1 (sağ), RTL'de −1 (sol). */
export function inlineSign(element: Element): 1 | -1 {
  return isRtl(element) ? -1 : 1;
}
