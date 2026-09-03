/**
 * VOL.ARACHNID locomotion benchmark'ı.
 *
 * İki yükü AYRI ölçer, çünkü ikisi farklı sebeplerle büyür:
 *
 * - **Simülasyon** (gövde + ikincil hareket + yürüyüş + IK): uzuv SAYISIYLA
 *   büyür ve kare hızından bağımsız olmalıdır.
 * - **Sunum** (poz gölgesi + art-görüntü): rig'in PARÇA sayısıyla büyür. 72
 *   parçalık bir rig'de gölge her karede 72 dönüşüm günceller ve atılım
 *   sırasında art-görüntü bunu çoğaltır.
 *
 * Tek bir "kare başına ms" sayısı bu ikisini karıştırır ve hangisinin
 * pahalandığını gizler. Bir bütçe aşımında sorulacak ilk soru "hangi katman?"
 * olduğu için ayrı ölçülürler.
 *
 * Ölçülen şey RENDER DEĞİLDİR: sahne headless bir ikizdir ve GPU'ya hiçbir şey
 * gitmez. Ölçülen, CPU'daki dönüşüm ve karar maliyetidir — kare bütçesinin
 * oyun mantığına giden kısmı.
 */
import { installHeadlessDom } from './dom';

installHeadlessDom();

const USAGE = [
  'Kullanım:',
  '  pnpm --filter @volstudio/vol-arachnid benchmark:locomotion',
  '    [--iterations N] [--warmup N] [--samples N] [--step-ms N] [--json]',
].join('\n');

interface Flags {
  readonly iterations: number;
  readonly warmupIterations: number;
  readonly samples: number;
  readonly stepMs: number;
  readonly json: boolean;
}

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function parseFlags(args: readonly string[]): Flags {
  let iterations = 1_000;
  let warmupIterations = 100;
  // bkz. core/src/benchmark/harness.ts DEFAULT_SAMPLES — nearest-rank p95
  // formülü N < 20'de her zaman maksimumu seçer.
  let samples = 25;
  let stepMs = 16;
  let json = false;

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--json') {
      json = true;
      continue;
    }
    const raw = args[++index];
    if (raw === undefined) fail(`${flag} bir değer bekliyor`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
      fail(`${flag} güvenli, negatif olmayan tam sayı olmalı`);
    }
    switch (flag) {
      case '--iterations':
        if (value < 1) fail('--iterations en az 1 olmalı');
        iterations = value;
        break;
      case '--warmup':
        warmupIterations = value;
        break;
      case '--samples':
        if (value < 1) fail('--samples en az 1 olmalı');
        samples = value;
        break;
      case '--step-ms':
        if (value < 1) fail('--step-ms en az 1 olmalı');
        stepMs = value;
        break;
      default:
        fail(`Bilinmeyen bayrak: ${flag}`);
    }
  }

  return { iterations, warmupIterations, samples, stepMs, json };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  /*
   * Phaser'a dokunan her şey DİNAMİK import edilir: statik import'lar hoist
   * edilir ve DOM kurulmadan önce çalışırdı.
   */
  const { runBenchmarkSuite } = await import('@volstudio/core/benchmark');
  const {
    GhostTrail,
    PoseShadow,
    Vector2,
    articulateRigDefinition,
    assembleRig,
    buildRigDefinition,
    createRandom,
    validateRigMetadata,
  } = await import('@volstudio/core');
  const { arenaConfig } = await import('../../src/config/arena');
  const { fxConfig } = await import('../../src/config/fx');
  const { ARACHNID_ARTICULATION } = await import('../../src/config/rig');
  const { ArachnidBody } = await import('../../src/runtime/entity/ArachnidBody');
  const { ArachnidLegs } = await import('../../src/runtime/entity/ArachnidLegs');
  const { ArachnidBodyMotion } = await import('../../src/runtime/rig/ArachnidBodyMotion');
  const { prepareArachnidRig } = await import('../../src/runtime/rig/arachnidRig');
  const { createHeadlessScene, readShippedMetadata } = await import('./headlessRig');

  const { stepMs } = flags;

  /** Girdi akışı tekrarlanabilir: iki koşu aynı yolu sürer. */
  const INPUT_SEED = 0x42_45_4e_43;

  // Rig GÖNDERİLEN metadata'dan kurulur — oyunun gerçekten yüklediği dosya.
  const metadata = validateRigMetadata(readShippedMetadata(), 'arachnid.metadata.json');
  const definition = articulateRigDefinition(
    buildRigDefinition(
      metadata,
      Object.fromEntries(metadata.parts.map((part) => [part.file, part.file])),
    ),
    ARACHNID_ARTICULATION,
  );

  function createChain() {
    const scene = createHeadlessScene(definition.parts.map((part) => part.textureKey));
    const assembled = assembleRig(scene as never, definition);
    const rig = prepareArachnidRig(metadata, assembled);
    const body = new ArachnidBody(arenaConfig.widthPx / 2, arenaConfig.heightPx / 2);
    const legs = new ArachnidLegs(rig);
    legs.reset(body.position.x, body.position.y, body.facingRad);
    return { scene, assembled, rig, body, legs, motion: new ArachnidBodyMotion(rig) };
  }

  const workloads = [
    {
      /*
       * Yalnız SİMÜLASYON: gövde entegrasyonu, ikincil hareket sinyalleri,
       * yürüyüş döngüsü ve on uzvun ters kinematiği. Sunum katmanı yok.
       */
      name: 'vol-arachnid/locomotion-step',
      create: () => {
        const chain = createChain();
        const random = createRandom(INPUT_SEED);
        let intent = new Vector2(1, 0);
        let checksum = 0;
        let frame = 0;

        return {
          step(): void {
            if (frame % 12 === 0) {
              const angle = random.bipolar() * Math.PI;
              intent = new Vector2(Math.cos(angle), Math.sin(angle));
            }
            const dash = random.next() < 0.03;

            chain.body.update(intent, dash, stepMs);
            const accel = chain.body.accelerationVector;
            const signals = chain.motion.update(
              {
                speed: chain.body.speed,
                accelX: accel.x,
                accelY: accel.y,
                turnRate: chain.body.turnRate,
                facingRad: chain.body.facingRad,
                dash01: chain.body.dash01,
              },
              stepMs,
            );
            chain.legs.update(
              {
                bodyX: chain.body.position.x,
                bodyY: chain.body.position.y,
                bodyRad: chain.body.facingRad,
                velX: chain.body.velocity.x,
                velY: chain.body.velocity.y,
                turnRate: chain.body.turnRate,
                motion01: signals.motion01,
                dash01: chain.body.dash01,
                crouch01: signals.crouch01,
                airborne: chain.body.isDashing,
              },
              stepMs,
            );

            frame += 1;
            if (frame % 32 === 0) checksum += chain.body.position.x + chain.legs.steppingLimbCount;
          },
          dispose(): void {
            if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
          },
        };
      },
    },
    {
      /*
       * Simülasyon + SUNUM. Fark, poz-türevi efektlerin kare bütçesinden ne
       * kadar aldığını doğrudan verir; art-görüntü atılım boyunca örneklendiği
       * için akışta atılım payı bilinçli olarak yüksek tutulur.
       */
      name: 'vol-arachnid/locomotion-step-with-pose-fx',
      create: () => {
        const chain = createChain();
        const random = createRandom(INPUT_SEED);
        const shadow = new PoseShadow(chain.scene as never, fxConfig.shadow);
        const trail = new GhostTrail(chain.scene as never, fxConfig.ghostTrail);
        const poseRoot = chain.assembled.container as never;
        let intent = new Vector2(1, 0);
        let checksum = 0;
        let frame = 0;

        return {
          step(): void {
            if (frame % 12 === 0) {
              const angle = random.bipolar() * Math.PI;
              intent = new Vector2(Math.cos(angle), Math.sin(angle));
            }
            const dash = random.next() < 0.12;

            chain.body.update(intent, dash, stepMs);
            const accel = chain.body.accelerationVector;
            const signals = chain.motion.update(
              {
                speed: chain.body.speed,
                accelX: accel.x,
                accelY: accel.y,
                turnRate: chain.body.turnRate,
                facingRad: chain.body.facingRad,
                dash01: chain.body.dash01,
              },
              stepMs,
            );
            chain.legs.update(
              {
                bodyX: chain.body.position.x,
                bodyY: chain.body.position.y,
                bodyRad: chain.body.facingRad,
                velX: chain.body.velocity.x,
                velY: chain.body.velocity.y,
                turnRate: chain.body.turnRate,
                motion01: signals.motion01,
                dash01: chain.body.dash01,
                crouch01: signals.crouch01,
                airborne: chain.body.isDashing,
              },
              stepMs,
            );

            if (chain.body.isDashing) trail.capture(poseRoot);
            trail.update(stepMs);
            shadow.update(poseRoot);

            frame += 1;
            if (frame % 32 === 0) checksum += chain.body.position.x + chain.scene.images.length;
          },
          dispose(): void {
            shadow.destroy();
            trail.destroy();
            if (!Number.isFinite(checksum)) throw new Error('Benchmark checksum bozuldu');
          },
        };
      },
    },
  ];

  const suite = runBenchmarkSuite(workloads, {
    iterations: flags.iterations,
    warmupIterations: flags.warmupIterations,
    samples: flags.samples,
  });

  if (flags.json) {
    console.log(JSON.stringify(suite, null, 2));
    return;
  }

  const budgetMs = stepMs;
  console.log(
    `\nVOL.ARACHNID locomotion — ${flags.iterations} kare × ${flags.samples} örnek, ` +
      `adım ${stepMs} ms\n`,
  );
  for (const result of suite.workloads) {
    const share = (result.medianMsPerIteration / budgetMs) * 100;
    console.log(
      `  ${result.name.padEnd(44)} ` +
        `medyan ${result.medianMsPerIteration.toFixed(4)} ms/kare  ` +
        `p95 ${result.p95MsPerIteration.toFixed(4)} ms  ` +
        `kare bütçesinin %${share.toFixed(2)}'si`,
    );
  }
  console.log('');
}

void main();
