/**
 * IME (Japonca/Çince/Korece, Android tahmin klavyesi) kompozisyonu sürerken `Enter`/`Escape`/ok tuşları KOMPOZİSYONUN
 * kendisine aittir: aday seçer, adayı iptal eder, adaylar arasında gezer. Bileşen bu tuşları kendi eylemi sanıp işlerse
 * (gönder, kapat, seçimi değiştir) kullanıcı yazdığı metni bitiremeden formu yollar ya da penceresini kaybeder.
 *
 * Bu yüzden her metin girişi tuş işleyicisi bu denetimle başlar. İki işaret birlikte aranır: standart `isComposing` ve
 * WebKit/eski Chromium'un kompozisyon sonu `keydown`ında bıraktığı `keyCode === 229` (ayrışmış `isComposing` false
 * iken bile IME tuşu olduğunu söyler).
 */
export function isComposingKey(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/**
 * Ekran klavyesinin eylem tuşunu belirler (`enterkeyhint`). İpucu yokken Android Chrome'da Gboard tek alanda
 * "Sonraki" gösterir ve Chrome bunu odak gezintisi sayar: sayfaya HİÇ `Enter` gelmez, Enter ile çalışan komut/gönder
 * eylemine klavyeden ulaşılamaz (Lenovo TB350FU + Gboard'da ölçüldü). `go`/`done`/`search`/`send` ise gerçek bir
 * `keydown` `Enter` (keyCode 13, bileşim dışı) üretir.
 */
export function setEnterKeyHint(element: HTMLElement, hint: string | undefined): void {
  if (hint) element.setAttribute('enterkeyhint', hint);
}
