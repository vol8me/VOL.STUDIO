/**
 * Android `dumpsys audio` çalma yapılandırması ayrıştırıcısı (UI-02.5).
 *
 * Bir uygulamanın cihaz ses çıkışına GERÇEKTEN bir oynatıcı açıp açmadığını gösterir:
 * her `AudioPlaybackConfiguration` satırı tür (AAudio, AudioTrack, SoundPool…), durum
 * (`started`/`idle`), kullanım, örnekleme hızı ve sessizlik nedenini taşır. Kanıtın
 * sınırı: oynatıcı AudioFlinger'a ulaştı demektir; sesin DUYULDUĞUNU göstermez
 * (`mutedState` akış ses seviyesi sıfırsa `streamVolume` yazar).
 */

const LINE =
  /AudioPlaybackConfiguration piid:(\d+) deviceId:(\d+) type:(\S+) u\/pid:(\d+)\/(\d+) state:(\w+) attr:AudioAttributes: usage=(\S+) .*?mutedState:(\S+).*?sampleRate=(\d+)/;

/** `dumpsys audio` metnindeki tüm oynatıcılar. */
export function parseAudioPlayers(text) {
  const players = [];
  for (const line of text.split(/\r?\n/)) {
    const match = LINE.exec(line);
    if (!match) continue;
    players.push({
      piid: Number(match[1]),
      deviceId: Number(match[2]),
      type: match[3],
      uid: Number(match[4]),
      pid: Number(match[5]),
      state: match[6],
      usage: match[7],
      mutedState: match[8],
      sampleRate: Number(match[9]),
    });
  }
  return players;
}

/** `pm list packages -U` çıktısından uygulama uid'i; bulunamazsa `null`. */
export function parsePackageUid(text, pkg) {
  const match = new RegExp(`package:${pkg.replace(/\./g, '\\.')}\\s+uid:(\\d+)`).exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Bir uygulamanın çıkış özeti. `reachedOutput`: en az bir oynatıcı `started`;
 * `audible`: o oynatıcılardan biri sessize alınmamış. Cihaz akış seviyesi sıfırsa
 * `reachedOutput` doğru, `audible` yanlıştır ve neden `mutedStates` içinde görünür.
 */
export function summarizeAudioOutput(players, uid) {
  const own = players.filter((player) => player.uid === uid);
  const started = own.filter((player) => player.state === 'started');
  return {
    players: own.length,
    started: started.length,
    reachedOutput: started.length > 0,
    audible: started.some((player) => player.mutedState === 'none'),
    outputs: started.map(({ type, usage, sampleRate, mutedState }) => ({
      type,
      usage,
      sampleRate,
      mutedState,
    })),
    mutedStates: [...new Set(started.map((player) => player.mutedState))].sort(),
  };
}
