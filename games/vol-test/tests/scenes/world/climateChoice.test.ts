import { describe, expect, it } from 'vitest';
import { climateChoice } from '@/scenes/world/climateChoice';

const query = (search = ''): URLSearchParams => new URLSearchParams(search);

describe('climateChoice', () => {
  it('ayar auto ise hiçbir şey zorlanmaz; ayar yoksa da aynıdır', () => {
    expect(climateChoice({ season: 'auto', weather: 'auto' }, query())).toEqual({
      season: undefined,
      weather: undefined,
    });
    expect(climateChoice(undefined, query())).toEqual({ season: undefined, weather: undefined });
  });

  it('geliştirici ayarı mevsim ve havayı zorlar', () => {
    expect(climateChoice({ season: 'winter', weather: 'snow' }, query())).toEqual({
      season: 'winter',
      weather: 'snow',
    });
  });

  it('öncelik: bağlantı parametresi, ölçüm geçersiz kılması, ayar', () => {
    const preferences = { season: 'winter', weather: 'snow' } as const;
    expect(
      climateChoice(preferences, query('?season=summer'), { season: 'autumn', weather: 'dust' }),
    ).toEqual({ season: 'summer', weather: 'dust' });
    expect(climateChoice(preferences, query('?weather=rain'), { season: 'autumn' })).toEqual({
      season: 'autumn',
      weather: 'rain',
    });
    // Geçersiz parametre ayara düşer.
    expect(climateChoice(preferences, query('?season=monsoon&weather=fog'))).toEqual({
      season: 'winter',
      weather: 'snow',
    });
  });
});
