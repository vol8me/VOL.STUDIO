/**
 * Özgün oyun ikonları: Phosphor Fill setinde karşılığı olmayan RTS ve bullet hell nesneleri.
 * Aynı 256 ızgarada, aynı dilde çizilir: dolu, yuvarlak, minimal siluet; tek renk
 * (`currentColor`). Çizgi kullanan parçalar yuvarlak uçlu kalın çizgidir; boyaları sprite
 * simgesinde değil parçada verilir.
 *
 * Her kayıt bir SVG gövdesidir (simge `viewBox="0 0 256 256"` ve `fill="currentColor"` ile sarılır).
 */
const line = (d, width = 18) =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const solid = (d, extra = '') => `<path d="${d}"${extra}/>`;
const soft = (d, width = 10) =>
  `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linejoin="round"/>`;
const hole = (d) => `<path d="${d}" fill-rule="evenodd"/>`;

/** Mazgallı kule gövdesi; açıklıklar çift-tek dolgu ile oyulur. */
const TOWER = 'M56 52H92V76H112V52H144V76H164V52H200V108H184V216H72V108H56Z';
const tower = (cutout) => hole(`${TOWER}${cutout}`);

export const AUTHORED_ICONS = {
  mine: line('M60 196L168 88', 22) + line('M104 48Q216 40 208 152', 22),
  amulet:
    line('M72 40L128 132L184 40', 12) +
    hole('M76 168a52 52 0 1 0 104 0a52 52 0 1 0 -104 0ZM128 144l24 24-24 24-24-24Z'),
  bow:
    line('M72 40Q232 128 72 216', 20) +
    line('M72 40V216', 8) +
    line('M72 128H196', 12) +
    solid(
      'M220 128L184 104V152Z',
      ' stroke="currentColor" stroke-width="8" stroke-linejoin="round"',
    ),
  helmet:
    hole('M48 172V124A80 80 0 0 1 208 124V172ZM88 128H168V152H88Z') +
    solid('M40 176H216V204H40Z', ' stroke="currentColor" stroke-width="8" stroke-linejoin="round"'),
  ring:
    line('M128 96A68 68 0 1 1 127.9 96Z', 28) +
    solid(
      'M128 36L164 72L128 108L92 72Z',
      ' stroke="currentColor" stroke-width="10" stroke-linejoin="round"',
    ),
  helicopter:
    solid('M50 140a60 40 0 1 0 120 0a60 40 0 1 0 -120 0Z') +
    line('M160 128L226 106', 18) +
    line('M40 76H200', 14) +
    line('M120 76V104', 14) +
    line('M60 204H170', 12) +
    line('M84 176V204M146 176V204', 10),
  siege:
    line('M48 170H208', 20) +
    line('M88 170L204 62', 18) +
    solid('M184 56a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z') +
    solid('M48 202a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z') +
    solid('M160 202a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z'),
  spearman:
    line('M52 204L168 88', 14) +
    soft('M220 36L190 108L148 66Z') +
    solid('M220 36L190 108L148 66Z') +
    solid('M64 196a36 36 0 1 0 72 0a36 36 0 1 0 -72 0Z'),
  tank:
    hole(
      'M72 168H184A28 28 0 0 1 184 224H72A28 28 0 0 1 72 168ZM80 186a10 10 0 1 0 0.1 0ZM112 186a10 10 0 1 0 0.1 0ZM144 186a10 10 0 1 0 0.1 0ZM176 186a10 10 0 1 0 0.1 0Z',
    ) +
    solid('M56 150H200V170H56Z') +
    solid('M88 106H168Q186 106 186 124V154H70V124Q70 106 88 106Z') +
    line('M176 128H240', 16),
  archerTower: tower('M122 128h12v44h-12Z'),
  guardTower: tower('M128 128l22 22-22 22-22-22Z'),
  fireTower: tower('M128 120C150 144 156 160 128 184C100 160 106 144 128 120Z'),
  mageTower: tower('M128 116L137 143L164 152L137 161L128 188L119 161L92 152L119 143Z'),
  watchtower: tower('M100 152a28 18 0 1 0 56 0a28 18 0 1 0 -56 0Z'),
  ballista:
    line('M44 112Q128 40 212 112', 16) +
    line('M44 112L128 152L212 112', 6) +
    line('M128 56V204', 14) +
    solid(
      'M128 28L108 64H148Z',
      ' stroke="currentColor" stroke-width="8" stroke-linejoin="round"',
    ) +
    line('M84 218H172', 18),
  cannon:
    line('M80 160L176 112', 56) +
    hole('M52 192a40 40 0 1 0 80 0a40 40 0 1 0 -80 0ZM76 192a16 16 0 1 1 32 0a16 16 0 1 1 -32 0Z') +
    solid('M200 84a20 20 0 1 0 40 0a20 20 0 1 0 -40 0Z'),
  bullet: hole('M128 36C170 70 176 110 176 150V204H80V150C80 110 86 70 128 36ZM90 168H166V180H90Z'),
  iron:
    soft('M96 56H160L176 112H80Z') +
    solid('M96 56H160L176 112H80Z') +
    soft('M48 128H120L130 188H38Z') +
    solid('M48 128H120L130 188H38Z') +
    soft('M136 128H208L218 188H146Z') +
    solid('M136 128H208L218 188H146Z'),
};
