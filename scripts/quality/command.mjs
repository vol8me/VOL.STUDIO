import crossSpawn from 'cross-spawn';

function commandOptions(options = {}) {
  if (process.platform !== 'win32' || !options.env) return options;
  const env = {};
  const keys = new Map();
  for (const [key, value] of Object.entries(options.env)) {
    const folded = key.toUpperCase();
    const previous = keys.get(folded);
    if (previous) delete env[previous];
    keys.set(folded, key);
    env[key] = value;
  }
  return { ...options, env };
}

function invocation(args, options) {
  return Array.isArray(args)
    ? { args, options: commandOptions(options) }
    : { args: [], options: commandOptions(args) };
}

export function spawn(command, args = [], options = {}) {
  const call = invocation(args, options);
  return crossSpawn(command, call.args, call.options);
}

export function spawnSync(command, args = [], options = {}) {
  const call = invocation(args, options);
  return crossSpawn.sync(command, call.args, call.options);
}

/** execFileSync hata/çıktı sözleşmesi, Windows shim çözümüyle aynı süreç yolunu kullanır. */
export function execFileSync(command, args = [], options = {}) {
  const call = invocation(args, options);
  const result = spawnSync(command, call.args, call.options);
  if (call.options.stdio === undefined && result.stderr?.length)
    process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) {
    const error =
      result.error ??
      new Error(`Command failed: ${command} ${call.args.join(' ')}\n${result.stderr ?? ''}`);
    throw Object.assign(error, result);
  }
  return result.stdout;
}
