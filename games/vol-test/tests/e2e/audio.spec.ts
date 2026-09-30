import { expect, test } from '@playwright/test';

test('OGG çözülür, gerçek döngüler başlar ve duraklatmada durur', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });
  page.on('response', (response) => {
    if (
      response.url().includes('/assets/audio/') &&
      (!response.ok() || !response.headers()['content-type']?.includes('audio/'))
    )
      failures.push(`Ses yanıtı: ${response.status()} ${response.headers()['content-type']}`);
  });
  await page.addInitScript(() => {
    const state = { loops: 0, stopped: 0, shots: 0 };
    Object.assign(window, { __audioProbe: state });
    const start = AudioBufferSourceNode.prototype.start;
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && this.buffer.length > 0) {
        if (this.loop) state.loops++;
        else state.shots++;
      }
      return start.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<typeof stop>) {
      if (this.loop) state.stopped++;
      return stop.apply(this, args);
    };
  });
  const read = () =>
    page.evaluate(
      () =>
        (window as unknown as { __audioProbe: { loops: number; stopped: number; shots: number } })
          .__audioProbe,
    );
  await page.goto('/');
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.locator('#game > canvas').click({ position: { x: 640, y: 400 } });
  await expect
    .poll(async () => ({ probe: await read(), failures }))
    .toMatchObject({ probe: { loops: 7 }, failures: [] });
  await page.mouse.down();
  await expect.poll(async () => (await read()).shots).toBeGreaterThan(0);
  await page.mouse.up();
  await page.keyboard.down('Escape');
  await expect(page.locator('.vt-pause.vol-modal--visible')).toHaveCount(1);
  await page.keyboard.up('Escape');
  await expect.poll(async () => (await read()).stopped).toBe(7);
  await page.getByTestId('pause-resume').click();
  await expect.poll(async () => (await read()).loops).toBe(14);
  expect(failures).toEqual([]);
});
