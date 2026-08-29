import { DisposableScope } from '@volstudio/core';
import type { AudioSettings } from '@/app/AudioSettings';
import type { VideoSettings } from '@/app/VideoSettings';
import { gameAudio } from '@/app/services';
import { sfxVolumes } from '@/config/audio';
import type { AbilityRuntime } from '@/runtime/ability/AbilityRuntime';
import type { Player } from '@/runtime/entity/Player';
import type { CardInventoryManager } from '@/runtime/systems/CardInventoryManager';
import type { EffectManager } from '@/runtime/systems/EffectManager';
import type { RunEconomy } from '@/runtime/systems/RunEconomy';
import { CardScreens } from '@/runtime/ui/CardScreens';
import { GameHud } from '@/runtime/ui/GameHud';
import { DeathScreen } from './DeathScreen';
import { PauseScreen } from './PauseScreen';

export interface GameScreenStackOptions {
  parent: HTMLElement;
  player: Player;
  effects: EffectManager;
  cards: CardInventoryManager;
  abilities: AbilityRuntime;
  economy: RunEconomy;
  audioSettings: AudioSettings;
  videoSettings: VideoSettings;
  onPauseForCard: () => void;
  onResumeAfterCard: () => void;
  onResumeFromMenu: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
}

/**
 * Oyun sahnesinin DOM yüzeylerinin tek sahibi.
 *
 * HUD, kart akışı, pause ve koşu özeti aynı UIRoot ömrünü paylaşır. Bunları
 * sahnede ayrı alan/cleanup zinciri olarak tutmak, bir `destroy()` hatasında
 * geri kalan yüzeylerin restart'a sızmasına izin veriyordu. Scope kapanışı
 * hata izolasyonludur ve ekranları ters kurulum sırasıyla bırakır.
 */
export class GameScreenStack {
  readonly hud!: GameHud;
  readonly cards!: CardScreens;
  readonly pause!: PauseScreen;
  readonly death!: DeathScreen;
  private readonly scope = new DisposableScope();

  constructor(options: GameScreenStackOptions) {
    const { parent, player, effects, cards, economy, audioSettings, videoSettings } = options;

    try {
      this.hud = this.scope.addDestroyable(new GameHud(parent, player, economy));
      this.hud.reset();

      this.cards = this.scope.addDestroyable(
        new CardScreens(
          parent,
          cards,
          economy,
          {
            onOpen: options.onPauseForCard,
            onClose: options.onResumeAfterCard,
            onCardTaken: (source) => {
              effects.play('cardPicked', player.getX(), player.getPosition().y);
              const sound = source === 'shop' ? 'cardBuy' : 'cardPick';
              void gameAudio.playSfx(sound, { volume: sfxVolumes[sound] });
            },
            onReroll: () => void gameAudio.playSfx('reroll', { volume: sfxVolumes.reroll }),
            onLockToggle: () => void gameAudio.playSfx('lock', { volume: sfxVolumes.lock }),
            onDeny: () => void gameAudio.playSfx('deny', { volume: sfxVolumes.deny }),
            onStatsOpen: () => void gameAudio.playSfx('menuBlip', { volume: sfxVolumes.menuBlip }),
            onShopVisibilityChange: (visible) => this.hud.setFluxVisible(!visible),
          },
          {
            player,
            abilities: options.abilities,
          },
        ),
      );

      this.pause = this.scope.addDestroyable(
        new PauseScreen(parent, audioSettings, videoSettings, {
          onResume: options.onResumeFromMenu,
          onRestart: () => {
            void gameAudio.playSfx('restart', { volume: sfxVolumes.restart });
            options.onRestart();
          },
          onMainMenu: () => {
            void gameAudio.playSfx('back', { volume: sfxVolumes.back });
            options.onMainMenu();
          },
        }),
      );

      this.death = this.scope.addDestroyable(
        new DeathScreen(parent, {
          onRestart: () => {
            void gameAudio.playSfx('restart', { volume: sfxVolumes.restart });
            options.onRestart();
          },
          onMainMenu: () => {
            void gameAudio.playSfx('back', { volume: sfxVolumes.back });
            options.onMainMenu();
          },
        }),
      );
    } catch (error) {
      // Constructor tamamlanmazsa GameScene bu nesnenin referansını hiç
      // alamaz; dolayısıyla BaseScene cleanup'ı bize ulaşamaz. O ana kadar
      // kurulmuş yüzeyleri burada bırakıp asıl hatayı aynen yukarı taşı.
      this.scope.dispose();
      throw error;
    }
  }

  /** BaseScene'in dil aboneliğinden gelen tek yenileme kapısı. */
  refreshLabels(): void {
    this.hud.refreshLabels();
    this.cards.refreshLabels();
  }

  destroy(): void {
    this.scope.dispose();
  }
}
