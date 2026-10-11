/**
 * Kullanıcının hareket azaltma tercihi (`prefers-reduced-motion: reduce`), çağrı anında okunur: işletim sistemi
 * ayarı oyun sürerken değişebilir. Dekor geçişleri (sayı sayma, bar dolgusu, yüzen metin yükselişi) bu durumda doğrudan
 * son değere gider; zaman anlamı taşıyan ilerleme (TimerBar, geri sayım) bundan etkilenmez.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
