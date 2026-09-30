import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { createSceneAudio } from '@/audio/sceneAudio';
import { FakeAudioContext, FakeAudioNode } from '../support/fakeAudio';

describe('sahne ses bağlamı', () => {
  it('Web Audio kapalıysa kaynak kurmaz', () => {
    expect(createSceneAudio({ sound: {} } as Phaser.Scene)).toBeNull();
    expect(createSceneAudio({} as Phaser.Scene)).toBeNull();
  });
  it('Phaser hedefini kullanır, mevcut bağlamı sahiplenmez', () => {
    const context = new FakeAudioContext();
    const destination = new FakeAudioNode();
    const audio = createSceneAudio({ sound: { context, destination } } as unknown as Phaser.Scene);
    expect(context.gains[0].connections).toContain(destination);
    audio?.dispose();
    expect(context.gains.every((n) => n.disconnected)).toBe(true);
    expect(context.state).toBe('running');
  });
});
