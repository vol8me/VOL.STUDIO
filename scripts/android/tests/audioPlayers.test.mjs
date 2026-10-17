import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseAudioPlayers, parsePackageUid, summarizeAudioOutput } from '../audioPlayers.mjs';

const DUMP = [
  '(not logged)  AudioPlaybackConfiguration piid:87 deviceId:0 type:android.media.SoundPool u/pid:1000/1247 state:idle attr:AudioAttributes: usage=USAGE_ASSISTANCE_SONIFICATION content=CONTENT_TYPE_SONIFICATION flags=0x800 tags= bundle=null sessionId:0 mutedState:none  FormatInfo{isSpatialized=false, channelMask=0x0, sampleRate=0}',
  '  AudioPlaybackConfiguration piid:583 deviceId:2 type:AAudio u/pid:10133/13101 state:started attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_UNKNOWN source=DEFAULT flags=0x0 tags= bundle=null sessionId:-1 mutedState:streamVolume  FormatInfo{isSpatialized=false, channelMask=0x3, sampleRate=48000}',
  '  AudioPlaybackConfiguration piid:600 deviceId:2 type:AAudio u/pid:10133/13101 state:started attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_UNKNOWN source=DEFAULT flags=0x0 tags= bundle=null sessionId:-1 mutedState:none  FormatInfo{isSpatialized=false, channelMask=0x3, sampleRate=44100}',
  '  AudioPlaybackConfiguration piid:601 deviceId:2 type:AudioTrack u/pid:10200/1 state:idle attr:AudioAttributes: usage=USAGE_MEDIA content=CONTENT_TYPE_UNKNOWN source=DEFAULT flags=0x0 tags= bundle=null sessionId:-1 mutedState:none  FormatInfo{isSpatialized=false, channelMask=0x3, sampleRate=48000}',
  '  ducked players piids:',
  '10-02 23:27:36:934 new player piid:479 uid/pid:10316/3438 type:AAudio attr:AudioAttributes: usage=USAGE_MEDIA',
].join('\n');

describe('dumpsys audio oynatıcı ayrıştırma', () => {
  it('yalnız AudioPlaybackConfiguration satırlarını alır; günlük satırlarını yok sayar', () => {
    const players = parseAudioPlayers(DUMP);
    assert.deepEqual(
      players.map((player) => player.piid),
      [87, 583, 600, 601],
    );
    assert.deepEqual(players[1], {
      piid: 583,
      deviceId: 2,
      type: 'AAudio',
      uid: 10133,
      pid: 13101,
      state: 'started',
      usage: 'USAGE_MEDIA',
      mutedState: 'streamVolume',
      sampleRate: 48000,
    });
  });

  it('boş ve bozuk metinde boş liste verir', () => {
    assert.deepEqual(parseAudioPlayers(''), []);
    assert.deepEqual(parseAudioPlayers('AudioPlaybackConfiguration piid:x'), []);
  });

  it('paket uid değerini noktaları kaçırarak bulur; başka paketle karışmaz', () => {
    const text = 'package:com.androidXchrome uid:1\npackage:com.android.chrome uid:10133';
    assert.equal(parsePackageUid(text, 'com.android.chrome'), 10133);
    assert.equal(parsePackageUid(text, 'com.missing'), null);
  });
});

describe('çıkış özeti', () => {
  const players = parseAudioPlayers(DUMP);

  it('çıkışa ulaşmayı duyulabilirlikten ayırır: akış seviyesi sıfırsa ulaşır ama duyulmaz', () => {
    const muted = summarizeAudioOutput(players.slice(0, 2), 10133);
    assert.partialDeepStrictEqual(muted, {
      players: 1,
      started: 1,
      reachedOutput: true,
      audible: false,
    });
    assert.deepEqual(muted.mutedStates, ['streamVolume']);
  });

  it('en az bir oynatıcı sessize alınmamışsa duyulabilir sayar', () => {
    const summary = summarizeAudioOutput(players, 10133);
    assert.partialDeepStrictEqual(summary, { started: 2, reachedOutput: true, audible: true });
    assert.deepEqual(summary.mutedStates, ['none', 'streamVolume']);
  });

  it('başka uid oynatıcısı ve boşta oynatıcı çıkış sayılmaz', () => {
    assert.partialDeepStrictEqual(summarizeAudioOutput(players, 10200), {
      players: 1,
      started: 0,
      reachedOutput: false,
      audible: false,
    });
    assert.equal(summarizeAudioOutput(players, 99999).players, 0);
  });
});
