import { expect, test, vi } from 'vitest';
const background = vi.fn();
vi.mock('phaser', () => ({
  default: {
    Scene: class {
      cameras = { main: { setBackgroundColor: background } };
    },
  },
}));
import { MainScene } from '../../src/scenes/MainScene';
test('sahne açılır', () => {
  const scene = new MainScene();
  scene.create();
  expect(background).toHaveBeenCalledWith('#101820');
});
