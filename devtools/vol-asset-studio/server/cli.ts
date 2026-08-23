import { resolve } from 'node:path';
import { createAssetStudioServer } from './app.js';
import { packageRootFromRuntime } from './runtimePaths.js';

interface CliOptions {
  repoRoot: string;
  configPath?: string;
  host: string;
  allowedHosts: string[];
  port: number;
  accessToken?: string;
  frontend: 'development' | 'production';
}

function parseCli(argv: string[]): CliOptions {
  const result: CliOptions = {
    repoRoot: resolve(packageRootFromRuntime(), '../..'),
    host: '127.0.0.1',
    allowedHosts: [],
    port: 5175,
    frontend: 'development',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--repo' && value !== undefined) {
      result.repoRoot = resolve(value);
      index += 1;
    } else if (argument === '--config' && value !== undefined) {
      result.configPath = value;
      index += 1;
    } else if (argument === '--host' && value !== undefined) {
      result.host = value;
      index += 1;
    } else if (argument === '--allow-host' && value !== undefined) {
      // Tekrarlanabilir: joker bind'de tarayıcının yazacağı her ad ayrı verilir.
      result.allowedHosts.push(value);
      index += 1;
    } else if (argument === '--port' && value !== undefined) {
      const port = Number(value);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new RangeError('port');
      result.port = port;
      index += 1;
    } else if (argument === '--token' && value !== undefined) {
      result.accessToken = value;
      index += 1;
    } else if (argument === '--production') {
      result.frontend = 'production';
    } else {
      throw new TypeError(`unknown_argument:${argument ?? ''}`);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const server = await createAssetStudioServer({
    repoRoot: options.repoRoot,
    ...(options.configPath === undefined ? {} : { configPath: options.configPath }),
    host: options.host,
    allowedHosts: options.allowedHosts,
    ...(options.accessToken === undefined ? {} : { accessToken: options.accessToken }),
    frontend: options.frontend,
    logger: true,
  });

  if (server.accessToken !== undefined) {
    process.stdout.write(`VOL_ASSET_STUDIO_TOKEN=${server.accessToken}\n`);
  }
  await server.app.listen({ host: server.host, port: options.port });

  const close = async (): Promise<void> => {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await server.app.close();
  };
  const onSignal = (): void => {
    void close();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
