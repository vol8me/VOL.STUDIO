import type { WalkerId } from '../vehicles';
import { ARACHNID_LOOK } from './arachnid';
import type { SpiderLook } from './types';
import { WIDOW_LOOK } from './widow';

/** Bacaklı araçların sunumu: araç kimliğinden görünüme. */
export const SPIDER_LOOKS: Readonly<Record<WalkerId, SpiderLook>> = {
  arachnid: ARACHNID_LOOK,
  widow: WIDOW_LOOK,
};
