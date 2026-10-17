import type { GameServices } from '@/app/GameServices';

/**
 * Açılıştan sonra gösterilen ilk sahne. Oyuncu ana menüyü görür; ölçüm koşusu (Deck sondası)
 * ve `?start=world` geliştirme bağlantısı menüyü atlayıp doğrudan alıştırma dünyasını açar.
 */
export function firstScene(
  services: Pick<GameServices, 'measurements'> | undefined,
  search: string,
): 'Menu' | 'World' {
  if (!services || services.measurements) return 'World';
  return new URLSearchParams(search).get('start') === 'world' ? 'World' : 'Menu';
}
