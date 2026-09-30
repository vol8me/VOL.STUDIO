import type Phaser from 'phaser';
import { GameAudio } from './GameAudio';

export function createSceneAudio(scene: Phaser.Scene): GameAudio | null {
  const manager = scene.sound as Phaser.Sound.WebAudioSoundManager | undefined;
  if (!manager?.context || !manager.destination) return null;
  return new GameAudio(manager.context, manager.destination);
}
