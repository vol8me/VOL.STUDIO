import { scenarioDigest } from './scenarioDigest';

/** Node süreç girişi: DOM yoksa digest'i stdout'a JSON olarak yazar. */
if (typeof document !== 'undefined' || typeof window !== 'undefined') {
  throw new Error('Başsız senaryo koşusunda DOM bulunmamalı');
}
process.stdout.write(JSON.stringify(scenarioDigest(Number(process.argv[2]))));
