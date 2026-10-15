import type { VehicleId } from '@/config/vehicles';
import type { MessageKey } from '@/i18n/keys';

/** Araç adı ve sınıf anahtarları: garaj kartları ve geliştirici ekranının araç seçimi aynı metni kullanır. */
export const VEHICLE_NAME_KEYS = {
  striker: 'voltest:garage.vehicles.striker.name',
  bulwark: 'voltest:garage.vehicles.bulwark.name',
  dart: 'voltest:garage.vehicles.dart.name',
  arachnid: 'voltest:garage.vehicles.arachnid.name',
  widow: 'voltest:garage.vehicles.widow.name',
  goliath: 'voltest:garage.vehicles.goliath.name',
  manta: 'voltest:garage.vehicles.manta.name',
  barracuda: 'voltest:garage.vehicles.barracuda.name',
  leviathan: 'voltest:garage.vehicles.leviathan.name',
  warhound: 'voltest:garage.vehicles.warhound.name',
  templar: 'voltest:garage.vehicles.templar.name',
  juggernaut: 'voltest:garage.vehicles.juggernaut.name',
  jackal: 'voltest:garage.vehicles.jackal.name',
  panther: 'voltest:garage.vehicles.panther.name',
  rhino: 'voltest:garage.vehicles.rhino.name',
} as const satisfies Record<VehicleId, MessageKey>;

export const VEHICLE_CLASS_KEYS = {
  striker: 'voltest:garage.vehicles.striker.class',
  bulwark: 'voltest:garage.vehicles.bulwark.class',
  dart: 'voltest:garage.vehicles.dart.class',
  arachnid: 'voltest:garage.vehicles.arachnid.class',
  widow: 'voltest:garage.vehicles.widow.class',
  goliath: 'voltest:garage.vehicles.goliath.class',
  manta: 'voltest:garage.vehicles.manta.class',
  barracuda: 'voltest:garage.vehicles.barracuda.class',
  leviathan: 'voltest:garage.vehicles.leviathan.class',
  warhound: 'voltest:garage.vehicles.warhound.class',
  templar: 'voltest:garage.vehicles.templar.class',
  juggernaut: 'voltest:garage.vehicles.juggernaut.class',
  jackal: 'voltest:garage.vehicles.jackal.class',
  panther: 'voltest:garage.vehicles.panther.class',
  rhino: 'voltest:garage.vehicles.rhino.class',
} as const satisfies Record<VehicleId, MessageKey>;
