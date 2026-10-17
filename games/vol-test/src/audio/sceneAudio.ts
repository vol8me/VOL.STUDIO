import type Phaser from 'phaser';
import { GameAudio } from './GameAudio';

/**
 * Phaser'ın Web Audio yöneticisinden oyun ses düğümü kurar.
 *
 * WebKit'te (Safari ve Steam Deck WebView) `AudioContext` önceden `webkitAudioContext`
 * önekiyle sunulur; Phaser bu öneki tanımadığı için `scene.sound` bağlam üretmez.
 * Bu durumda `null` dönülür ve oyun sessiz çalışır. Web Audio'nun yokluğu
 * ölçülebilir bir platform sınırıdır, hata değildir.
 */
export function createSceneAudio(scene: Phaser.Scene): GameAudio | null {
  const manager = scene.sound as Phaser.Sound.WebAudioSoundManager | undefined;
  if (!manager?.context || !manager.destination) return null;
  return new GameAudio(manager.context, manager.destination);
}
