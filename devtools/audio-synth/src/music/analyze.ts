import { hashCanonical, type Sha256 } from '../protocol/canonical';
import type { MusicBriefV1 } from './brief';
import { densityBand, MUSIC_ANALYSIS_POLICY } from './policy';
import { musicProgramHash, type MusicProgramV1 } from './program';
import { scoreHash, type MusicScoreV1, type ScoreEventV1 } from './score';
import { isScaleName, midiToHz, pitchClass, scaleSteps } from './tonal';
import { describeRule, ruleId, type MusicRuleV1 } from './terms';
import { describeTransitions, type TransitionFindingV1 } from './transitions';
import { themeBookRules, type ThemeBookV1 } from './themeBook';

/**
 * Ses render EDİLMEDEN yapılan sembolik denetim. Ölçtükleri: yoğunluk,
 * polifoni, register, perde sınıfı dağılımı, motif tekrarı, bölüm kontrastı,
 * armonik ritim, kural ihlalleri ve brief uyumu.
 *
 * Raporun söyleyemediği şey de yazılır: `unchecked` listesi, makineyle
 * sınanmayan serbest metin kaçınmalarını saklamak yerine adıyla sayar.
 */
export const MUSIC_SYMBOLIC_SCHEMA = 'MusicSymbolicReportV1';

export interface MusicCheckV1 {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly value?: number;
}

export interface RuleFindingV1 {
  readonly ruleId: string;
  readonly rule: string;
  readonly ok: boolean;
  readonly overridden: boolean;
  readonly detail: string;
}

export interface LaneStatV1 {
  readonly id: string;
  readonly instrument: string;
  readonly role: string;
  readonly events: number;
  readonly notesPerBar: number;
  readonly lowMidi: number | null;
  readonly highMidi: number | null;
  readonly meanMidi: number | null;
  readonly maxPolyphony: number;
}

export interface SectionStatV1 {
  readonly id: string;
  readonly role: string;
  readonly bars: readonly [number, number];
  readonly targetEnergy: number;
  readonly measuredEnergy: number;
  readonly events: number;
  readonly notesPerBar: number;
  readonly activeLanes: number;
  readonly harmonicChangesPerBar: number;
}

export interface MotifStatV1 {
  readonly motif: string;
  readonly variationId: string;
  readonly instances: number;
  readonly chain: string;
}

export interface MusicSymbolicReportV1 {
  readonly schema: typeof MUSIC_SYMBOLIC_SCHEMA;
  readonly musicId: string;
  readonly programHash: Sha256;
  readonly scoreHash: Sha256;
  readonly policyVersion: number;
  readonly totals: {
    readonly events: number;
    readonly bars: number;
    readonly notesPerBar: number;
    readonly maxPolyphony: number;
    readonly outOfSystemRatio: number;
    readonly melodicSalience: number;
    readonly motifInstances: number;
    readonly uniqueVariations: number;
  };
  readonly pitchClasses: readonly number[];
  readonly lanes: readonly LaneStatV1[];
  readonly sections: readonly SectionStatV1[];
  readonly motifs: readonly MotifStatV1[];
  readonly rules: readonly RuleFindingV1[];
  readonly brief: readonly MusicCheckV1[];
  readonly transitions: readonly TransitionFindingV1[];
  readonly unchecked: readonly string[];
  readonly verdict: { readonly pass: boolean; readonly failures: readonly string[] };
}

const EPSILON = 1e-9;

function overlaps(a: ScoreEventV1, b: ScoreEventV1): boolean {
  return b.beat < a.beat + a.beats - EPSILON && a.beat < b.beat + b.beats - EPSILON;
}

/**
 * ANLIK eşzamanlılık: her olayın BAŞLANGICINDA kaç nota sürüyor. "Bu olayla
 * kesişen olay sayısı" ölçüsü yanlıştır — uzun bir akor sesi, art arda gelen
 * kısa notaların hepsiyle kesişir ama onlarla aynı anda çalmaz.
 */
function maxPolyphony(events: readonly ScoreEventV1[]): number {
  let worst = 0;
  for (const event of events) {
    const sounding = events.filter(
      (other) =>
        other.beat <= event.beat + EPSILON && event.beat < other.beat + other.beats - EPSILON,
    ).length;
    worst = Math.max(worst, sounding);
  }
  return worst;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function laneStats(score: MusicScoreV1): LaneStatV1[] {
  return score.lanes.map((lane) => {
    const events = score.events.filter((e) => e.lane === lane.id);
    const midis = events.map((e) => e.midi);
    return {
      id: lane.id,
      instrument: lane.instrument,
      role: lane.role,
      events: events.length,
      notesPerBar: round(events.length / score.bars),
      lowMidi: midis.length ? Math.min(...midis) : null,
      highMidi: midis.length ? Math.max(...midis) : null,
      meanMidi: midis.length ? round(mean(midis) as number, 2) : null,
      maxPolyphony: maxPolyphony(events),
    };
  });
}

function sectionStats(program: MusicProgramV1, score: MusicScoreV1): SectionStatV1[] {
  const raw = score.sections.map((section) => {
    const bars = section.bars[1] - section.bars[0];
    const events = score.events.filter((e) => e.section === section.id);
    const gain = mean(events.map((e) => e.gain)) ?? 0;
    const lanes = new Set(events.map((e) => e.lane)).size;
    const chords = program.sections.find((s) => s.id === section.id)?.harmony?.chords.length ?? 0;
    return {
      section,
      bars,
      events,
      lanes,
      energy: (events.length / bars) * gain * Math.max(1, lanes),
      harmonicChangesPerBar: round(chords / bars),
    };
  });
  const energies = raw.map((r) => r.energy);
  const low = Math.min(...energies);
  const high = Math.max(...energies);
  return raw.map((r) => ({
    id: r.section.id,
    role: r.section.role,
    bars: r.section.bars,
    targetEnergy: r.section.targetEnergy,
    measuredEnergy: round(high - low < EPSILON ? 0.5 : (r.energy - low) / (high - low)),
    events: r.events.length,
    notesPerBar: round(r.events.length / r.bars),
    activeLanes: r.lanes,
    harmonicChangesPerBar: r.harmonicChangesPerBar,
  }));
}

function motifStats(score: MusicScoreV1): MotifStatV1[] {
  const groups = new Map<string, MotifStatV1>();
  for (const event of score.events) {
    if (event.provenance.kind !== 'motif') continue;
    const key = event.provenance.variationId;
    const current = groups.get(key);
    groups.set(key, {
      motif: event.provenance.motif,
      variationId: key,
      instances: (current?.instances ?? 0) + 1,
      chain: event.provenance.chain.map((t) => t.op).join(' → ') || 'kaynak',
    });
  }
  return [...groups.values()].sort((a, b) => (a.variationId < b.variationId ? -1 : 1));
}

/**
 * Şerit ezgisel mi: üst üste binen SÜRE toplam süresinin küçük bir payı mı.
 * "Hiç binmesin" kuralı swing'i cezalandırırdı — geciken bir sekizlik bir
 * sonraki notaya birkaç milisaniye taşar ve bu ezgiyi akor yapmaz; üç sesli
 * bir akor şeridinde ise bindirme sürenin katı olur.
 */
const MELODIC_OVERLAP_RATIO = 0.15;

function laneOverlapRatio(events: readonly ScoreEventV1[]): number {
  const sorted = [...events].sort((a, b) => a.beat - b.beat);
  let total = 0;
  let overlap = 0;
  for (let i = 0; i < sorted.length; i++) {
    total += sorted[i].beats;
    const end = sorted[i].beat + sorted[i].beats;
    for (let j = i + 1; j < sorted.length && sorted[j].beat < end; j++) {
      overlap += Math.min(end, sorted[j].beat + sorted[j].beats) - sorted[j].beat;
    }
  }
  return total > 0 ? overlap / total : 1;
}

function isMelodicLane(events: readonly ScoreEventV1[]): boolean {
  return events.length > 0 && laneOverlapRatio(events) <= MELODIC_OVERLAP_RATIO;
}

/** Ölçülen melodik öne çıkma vekili: ezgisel şeritlerin medyan perde üstündeki payı. */
function melodicSalience(score: MusicScoreV1): number {
  if (score.events.length === 0) return 0;
  const midis = [...score.events.map((e) => e.midi)].sort((a, b) => a - b);
  const median = midis[Math.floor(midis.length / 2)];
  const melodic = new Set(
    score.lanes
      .filter((lane) => isMelodicLane(score.events.filter((e) => e.lane === lane.id)))
      .map((lane) => lane.id),
  );
  const salient = score.events.filter((e) => melodic.has(e.lane) && e.midi >= median).length;
  return round(salient / score.events.length);
}

function outOfSystemRatio(score: MusicScoreV1, scale: readonly number[]): number {
  if (score.events.length === 0) return 0;
  const root = pitchClass(score.rootMidi);
  const allowed = new Set(scale.map((step) => ((((step % 12) + 12) % 12) + root) % 12));
  const outside = score.events.filter((e) => !allowed.has(pitchClass(e.midi))).length;
  return round(outside / score.events.length);
}

function evaluateRule(
  rule: MusicRuleV1,
  program: MusicProgramV1,
  score: MusicScoreV1,
): { ok: boolean; detail: string } {
  switch (rule.kind) {
    case 'forbid-system':
      return {
        ok: program.tonal.system !== rule.system,
        detail: `sistem ${program.tonal.system}`,
      };
    case 'forbid-instrument': {
      const used = score.lanes
        .filter((lane) => lane.instrument === rule.instrument)
        .map((l) => l.id);
      return {
        ok: used.length === 0,
        detail: used.length ? `şerit: ${used.join(', ')}` : 'kullanılmadı',
      };
    }
    case 'forbid-role': {
      const used = score.lanes.filter((lane) => lane.role === rule.role).map((l) => l.id);
      return {
        ok: used.length === 0,
        detail: used.length ? `şerit: ${used.join(', ')}` : 'kullanılmadı',
      };
    }
    case 'forbid-interval': {
      const hits =
        rule.scope === 'harmonic'
          ? harmonicHits(score, rule.semitones)
          : melodicHits(score, rule.semitones);
      return { ok: hits === 0, detail: `${hits} kez` };
    }
    case 'max-density': {
      if (rule.scope === 'program') {
        const value = score.events.length / score.bars;
        return { ok: value <= rule.notesPerBar, detail: `${round(value, 2)} nota/ölçü` };
      }
      const worst = score.lanes
        .map((lane) => ({
          id: lane.id,
          value: score.events.filter((e) => e.lane === lane.id).length / score.bars,
        }))
        .sort((a, b) => b.value - a.value)[0];
      return {
        ok: !worst || worst.value <= rule.notesPerBar,
        detail: worst ? `${worst.id}: ${round(worst.value, 2)} nota/ölçü` : 'şerit yok',
      };
    }
    case 'max-polyphony': {
      const value = maxPolyphony(score.events);
      return { ok: value <= rule.voices, detail: `${value} eşzamanlı` };
    }
    case 'register-limit': {
      const lanes = score.lanes.filter((lane) => lane.role === rule.role);
      const outside = lanes.flatMap((lane) =>
        score.events.filter(
          (e) => e.lane === lane.id && (e.midi < rule.lowMidi || e.midi > rule.highMidi),
        ),
      );
      return {
        ok: outside.length === 0,
        detail: outside.length
          ? `${outside.length} nota bant dışında`
          : `${lanes.length} şerit bant içinde`,
      };
    }
  }
}

function harmonicHits(score: MusicScoreV1, semitones: number): number {
  let hits = 0;
  for (let i = 0; i < score.events.length; i++) {
    for (let j = i + 1; j < score.events.length; j++) {
      const a = score.events[i];
      const b = score.events[j];
      if (!overlaps(a, b)) continue;
      if (Math.abs(a.midi - b.midi) % 12 === semitones % 12) hits++;
    }
  }
  return hits;
}

function melodicHits(score: MusicScoreV1, semitones: number): number {
  let hits = 0;
  for (const lane of score.lanes) {
    const events = score.events.filter((e) => e.lane === lane.id);
    for (let i = 1; i < events.length; i++) {
      if (Math.abs(events[i].midi - events[i - 1].midi) === semitones) hits++;
    }
  }
  return hits;
}

function sectionContrast(sections: readonly SectionStatV1[]): number {
  let pairs = 0;
  let agree = 0;
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const target = sections[i].targetEnergy - sections[j].targetEnergy;
      if (Math.abs(target) < EPSILON) continue;
      pairs++;
      const measured = sections[i].measuredEnergy - sections[j].measuredEnergy;
      if (Math.sign(target) === Math.sign(measured)) agree++;
    }
  }
  return pairs === 0 ? 1 : round(agree / pairs);
}

function briefChecks(
  brief: MusicBriefV1,
  program: MusicProgramV1,
  score: MusicScoreV1,
  sections: readonly SectionStatV1[],
): MusicCheckV1[] {
  const checks: MusicCheckV1[] = [];
  const add = (name: string, ok: boolean, detail: string, value?: number) =>
    checks.push({ name, ok, detail, ...(value === undefined ? {} : { value }) });
  add('playback', brief.playback === program.playback, `${program.playback}`);
  add(
    'meter',
    brief.meter[0] === program.meter[0] && brief.meter[1] === program.meter[1],
    `${program.meter.join('/')}`,
  );
  add(
    'tempo',
    program.tempo.bpm >= brief.tempo.bpm.min && program.tempo.bpm <= brief.tempo.bpm.max,
    `${program.tempo.bpm} bpm ∈ [${brief.tempo.bpm.min}, ${brief.tempo.bpm.max}]`,
    program.tempo.bpm,
  );
  add(
    'length',
    program.bars >= brief.length.bars.min && program.bars <= brief.length.bars.max,
    `${program.bars} ölçü ∈ [${brief.length.bars.min}, ${brief.length.bars.max}]`,
    program.bars,
  );
  add(
    'tonal-system',
    brief.tonal.systems.includes(program.tonal.system),
    `${program.tonal.system} ∈ ${brief.tonal.systems.join(', ')}`,
  );
  const formRoles = [...program.sections].sort((a, b) => a.bars[0] - b.bars[0]).map((s) => s.role);
  add(
    'form',
    formRoles.length === brief.form.sections.length &&
      formRoles.every((r, i) => r === brief.form.sections[i]),
    `${formRoles.join(' → ')}`,
  );
  const notesPerBar = score.events.length / score.bars;
  const band = densityBand(brief.rhythmicDensity);
  add(
    'rhythmic-density',
    notesPerBar >= band.min && notesPerBar <= band.max,
    `${round(notesPerBar, 2)} nota/ölçü, "${brief.rhythmicDensity}" bandı [${band.min}, ${
      band.max
    }]`,
    round(notesPerBar, 2),
  );
  const salience = melodicSalience(score);
  add(
    'melodic-salience',
    Math.abs(salience - brief.melodicSalience) <= MUSIC_ANALYSIS_POLICY.melodicSalienceTolerance,
    `ölçülen ${salience}, beyan ${brief.melodicSalience}`,
    salience,
  );
  const contrast = sectionContrast(sections);
  add(
    'section-contrast',
    contrast >= MUSIC_ANALYSIS_POLICY.sectionContrastAgreement,
    `hedef sırayla uyum ${contrast}`,
    contrast,
  );
  if (brief.spectralPriority) {
    const protectedRatio = spectralProtectionRatio(score, brief);
    add(
      'spectral-priority',
      protectedRatio <= MUSIC_ANALYSIS_POLICY.spectralProtectionMaxRatio,
      `korunan banda düşen temel perde oranı ${protectedRatio} (sembolik vekil; gerçek spektrum render sonrası ölçülür)`,
      protectedRatio,
    );
  }
  if (brief.adaptive) {
    const declared = brief.adaptive.states.map((s) => `${s.id}:${s.intensity}`).join(', ');
    const built = (program.adaptive?.states ?? []).map((s) => `${s.id}:${s.intensity}`).join(', ');
    add('adaptive-states', declared === built, `brief [${declared}] program [${built}]`);
  }
  for (const rule of brief.avoid ?? []) {
    const outcome = evaluateRule(rule, program, score);
    add(`brief-avoid:${ruleId(rule)}`, outcome.ok, `${describeRule(rule)} — ${outcome.detail}`);
  }
  return checks;
}

function spectralProtectionRatio(score: MusicScoreV1, brief: MusicBriefV1): number {
  if (!brief.spectralPriority || score.events.length === 0) return 0;
  const inside = score.events.filter((event) => {
    const hz = midiToHz(event.midi);
    return brief.spectralPriority!.protect.some((band) => hz >= band.fromHz && hz <= band.toHz);
  }).length;
  return round(inside / score.events.length);
}

export interface AnalyzeInput {
  readonly program: MusicProgramV1;
  readonly score: MusicScoreV1;
  readonly brief?: MusicBriefV1;
  readonly themeBook?: ThemeBookV1;
}

/** Programı ve score'u ölçer, kuralları ve brief uyumunu değerlendirir. */
export function analyzeScore(input: AnalyzeInput): MusicSymbolicReportV1 {
  const { program, score } = input;
  const lanes = laneStats(score);
  const sections = sectionStats(program, score);
  const scale = scaleOf(program);
  const overrides = new Map((program.themeOverrides ?? []).map((o) => [o.rule, o.reason]));
  const rules = [...(input.themeBook ? themeBookRules(input.themeBook) : [])].map(
    (rule): RuleFindingV1 => {
      const id = ruleId(rule);
      const outcome = evaluateRule(rule, program, score);
      const override = overrides.get(id);
      return {
        ruleId: id,
        rule: describeRule(rule),
        ok: outcome.ok || override !== undefined,
        overridden: !outcome.ok && override !== undefined,
        detail:
          override && !outcome.ok ? `${outcome.detail} — override: ${override}` : outcome.detail,
      };
    },
  );
  const brief = input.brief ? briefChecks(input.brief, program, score, sections) : [];
  const motifs = motifStats(score);
  const pitchClasses = Array.from(
    { length: 12 },
    (_, pc) => score.events.filter((e) => pitchClass(e.midi) === pc).length,
  );
  const unchecked = [
    ...(input.brief?.avoidNotes ?? []).map((note) => `brief.avoidNotes: ${note}`),
    ...(input.themeBook?.notes ?? []).map((note) => `themeBook.notes: ${note}`),
  ];
  const failures = [
    ...rules.filter((r) => !r.ok).map((r) => `kural ${r.ruleId}`),
    ...brief.filter((c) => !c.ok).map((c) => `brief ${c.name}`),
  ];
  return {
    schema: MUSIC_SYMBOLIC_SCHEMA,
    musicId: program.musicId,
    programHash: musicProgramHash(program),
    scoreHash: scoreHash(score),
    policyVersion: MUSIC_ANALYSIS_POLICY.version,
    totals: {
      events: score.events.length,
      bars: score.bars,
      notesPerBar: round(score.events.length / score.bars, 3),
      maxPolyphony: maxPolyphony(score.events),
      outOfSystemRatio: outOfSystemRatio(score, scale),
      melodicSalience: melodicSalience(score),
      motifInstances: score.events.filter((e) => e.provenance.kind === 'motif').length,
      uniqueVariations: motifs.length,
    },
    pitchClasses,
    lanes,
    sections,
    motifs,
    rules,
    brief,
    transitions: describeTransitions(program.transitions ?? []),
    unchecked,
    verdict: { pass: failures.length === 0, failures },
  };
}

function scaleOf(program: MusicProgramV1): readonly number[] {
  return isScaleName(program.tonal.system) ? scaleSteps(program.tonal.system) : [];
}

export function reportHash(report: MusicSymbolicReportV1): Sha256 {
  return hashCanonical(report);
}
