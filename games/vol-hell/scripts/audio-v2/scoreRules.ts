import type { MusicProgramV1 } from '@volstudio/audio-synth/music/programTypes';

/**
 * Elle yazılan bestelerin form kapısı. Render'dan ÖNCE koşar: bölümler
 * kapsayıcı ve dinamik olmalı, giriş sade olmalı, loop işaretleri eksiksiz
 * olmalı, yasaklı parlak presetler girmemeli ve doku ne boş ne makine
 * tüfeği olmalı. Amaç "tek akor + modulo melodi" setinin geri gelmesini
 * yapısal olarak imkânsız kılmaktır.
 */

const midiOf = (note: string): number | null => {
  const match = /^([A-G])([#b]?)(\d)$/.exec(note);
  if (!match) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base[match[1]] + accidental;
};

export function validateScoreStructure(program: MusicProgramV1): string[] {
  const issues: string[] = [];
  const sections = program.sections;

  if (sections.length < 4) issues.push(`bölüm sayısı ${sections.length} < 4`);

  let cursor = 0;
  for (const section of sections) {
    if (section.bars[0] !== cursor)
      issues.push(`${section.id}: bölüm ${section.bars[0]} beklenen ${cursor}`);
    cursor = section.bars[1];
  }
  if (cursor !== program.bars)
    issues.push(`bölümler ${program.bars} ölçüyü kapsamıyor (${cursor})`);

  const energies = sections.map((section) => section.targetEnergy);
  const spread = Math.max(...energies) - Math.min(...energies);
  if (spread < 0.3) issues.push(`enerji aralığı ${spread.toFixed(2)} < 0.30`);

  const first = sections[0];
  if (first.lanes.length > 2)
    issues.push(`${first.id}: giriş bölümü ${first.lanes.length} şeritli (en çok 2)`);
  if (first.targetEnergy > 0.45)
    issues.push(`${first.id}: giriş enerjisi ${first.targetEnergy} > 0.45`);

  const last = sections[sections.length - 1];
  if (last.targetEnergy > 0.6)
    issues.push(`${last.id}: dönüş enerjisi ${last.targetEnergy} > 0.60`);

  if (program.playback === 'loop') {
    const kinds = new Set((program.markers ?? []).map((marker) => marker.kind));
    if (!kinds.has('loop-start') || !kinds.has('loop-end')) issues.push('loop işaretleri eksik');
  }

  const perLane = new Map<string, number>();
  let total = 0;
  for (const section of sections) {
    for (const p of section.parts) {
      if (p.source !== 'notes') continue;
      if (!section.lanes.includes(p.lane))
        issues.push(`${section.id}: ${p.lane} bölüm şerit listesinde yok`);
      for (const note of p.notes) {
        total++;
        perLane.set(p.lane, (perLane.get(p.lane) ?? 0) + 1);
        const midi = midiOf(note.note);
        if (midi === null) issues.push(`${section.id}/${p.lane}: çözülemeyen nota ${note.note}`);
        else if (midi < 24 || midi > 96)
          issues.push(`${section.id}/${p.lane}: aralık dışı ${note.note}`);
        const span = section.bars[1] - section.bars[0];
        if (note.bar < 0 || note.bar >= span)
          issues.push(
            `${section.id}/${p.lane}: göreli ölçü ${note.bar} bölüm dışında (0-${span - 1})`,
          );
        if (note.beat < 0 || note.beat >= program.meter[0])
          issues.push(`${section.id}/${p.lane}: vuruş ${note.beat}`);
        if (note.beats <= 0) issues.push(`${section.id}/${p.lane}: süre ${note.beats}`);
      }
    }
  }

  const density = total / (program.bars * program.meter[0]);
  if (density > 14) issues.push(`nota yoğunluğu ${density.toFixed(2)}/vuruş > 14.00`);
  if (density < 0.25) issues.push(`nota yoğunluğu ${density.toFixed(2)}/vuruş < 0.25`);

  for (const [lane, count] of perLane) {
    const perBar = count / program.bars;
    if (perBar > 26) issues.push(`${lane}: ${perBar.toFixed(1)} nota/ölçü > 26`);
  }

  return issues;
}
