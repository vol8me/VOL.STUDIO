function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function appendedDiagnostics(before, after) {
  if (before === null || after === null || !after.startsWith(before)) return [];
  const tail = after.slice(before.length);
  return tail.split('\n').flatMap((line, index, lines) => {
    if (!line || index === lines.length - 1) return [];
    try {
      const record = JSON.parse(line);
      return record && typeof record === 'object' && !Array.isArray(record) ? [record] : [];
    } catch {
      return [];
    }
  });
}

export function gameDiagnostics(records) {
  const runs = new Set(
    records.map((record) => record.runId).filter((id) => typeof id === 'string'),
  );
  if (runs.size !== 1) return { fps: null, renderer: null, samples: 0 };
  const runId = [...runs][0];
  const current = records.filter((record) => record.runId === runId);
  const perf = current.filter((record) => record.type === 'perf' && finite(record.fps) !== null);
  const latest = perf.at(-1);
  const renderer =
    current
      .map((record) => record.renderer?.kind ?? record.renderer)
      .filter((kind) => ['webgl', 'canvas', 'headless'].includes(kind))
      .at(-1) ?? null;
  return { fps: latest ? finite(latest.fps) : null, renderer, samples: perf.length };
}

export function nativeRuntime(gfx, mem) {
  const pick = (text, pattern) => {
    const match = pattern.exec(text);
    return match ? Number(match[1]) : null;
  };
  const mb = (value) => (value === null ? null : Math.round(value / 1024));
  return {
    nativeRenderer: {
      totalFrames: pick(gfx, /Total frames rendered:\s*(\d+)/),
      jankPercent: pick(gfx, /Janky frames:\s*\d+\s*\(([\d.]+)%\)/),
      p50Ms: pick(gfx, /50th percentile:\s*(\d+)ms/),
      p90Ms: pick(gfx, /90th percentile:\s*(\d+)ms/),
      p99Ms: pick(gfx, /99th percentile:\s*(\d+)ms/),
      missedVsync: pick(gfx, /Number Missed Vsync:\s*(\d+)/),
    },
    memory: {
      pssMb: mb(pick(mem, /TOTAL PSS:\s*(\d+)/)),
      graphicsMb: mb(pick(mem, /Graphics:\s*(\d+)/)),
    },
  };
}
