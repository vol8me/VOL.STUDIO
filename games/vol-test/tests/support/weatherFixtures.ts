import type { SurfaceCell, SurfaceSample, WeatherFrame } from '@/sim/weather/WeatherSystem';
import type { WeatherSource } from '@/view/weather/SurfaceLayer';
import type { WeatherVehicleFrame } from '@/view/weather/VehicleReflectionPool';

export function sample(overrides: Partial<SurfaceSample> = {}): SurfaceSample {
  return {
    wetness: 0.7,
    puddleDepth: 0.03,
    snowDepth: 0,
    snowCompaction: 0,
    grip: 1,
    rollingResistance: 1,
    windX: 0,
    windY: 0,
    airDrag: 1,
    ...overrides,
  };
}

export function frame(overrides: Partial<WeatherFrame> = {}): WeatherFrame {
  return {
    kind: 'rain',
    season: 'spring',
    seasonProgress: 0,
    daylight: 0.7,
    airDrag: 1,
    dust: 0,
    rain: 1,
    snow: 0,
    windX: 20,
    windY: 0,
    temperature: 15,
    windTravelX: 20,
    windTravelY: 0,
    elapsedMs: 1000,
    ...overrides,
  };
}

export function weather(surface: SurfaceSample = sample()): WeatherSource {
  return {
    frame: frame(),
    cellSize: 64,
    columns: 4,
    rows: 4,
    sample: () => surface,
    cell: (col: number, row: number): SurfaceCell | undefined => {
      if (col < 0 || row < 0 || col >= 4 || row >= 4) return undefined;
      return { ...surface, x: col * 64, y: row * 64, width: 64, height: 64 };
    },
  };
}

export function vehicle(id = 1, overrides: Partial<WeatherVehicleFrame> = {}): WeatherVehicleFrame {
  return {
    id,
    x: 64,
    y: 64,
    hull: 0.5,
    turret: 1,
    pitch: 0,
    roll: 0,
    treadLeft: 3,
    treadRight: 5,
    speed: 100,
    angularVelocity: 0,
    boosting: false,
    ...overrides,
  };
}
