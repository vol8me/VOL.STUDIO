import { DisposableScope } from '@volstudio/core/lifecycle';
import { parseDriveOptions } from './driveOptions';
import { runDrive } from './driveRun';

const options = parseDriveOptions(process.argv.slice(2));
const scope = new DisposableScope();
const controller = new AbortController();
const cancel = (): void => controller.abort();
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, cancel);
  scope.addSubscription(() => process.off(signal, cancel));
}
try {
  if (!(await runDrive(options, controller.signal))) process.exitCode = 1;
} finally {
  scope.dispose();
}
