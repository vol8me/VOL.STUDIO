/**
 * Aday dinleme sayfası — bağımlılıksız statik HTML + CSS + JS. Veri DOM'a
 * yalnız `textContent`/`setAttribute` ile girer; hiçbir veri HTML olarak
 * ayrıştırılmaz. Canlı modda (`search audition --serve`) karar düğmeleri
 * `/api/decision`a yazar; statik kopyada (export/ altındaki index.html)
 * durum sayfaya gömülüdür ve sayfa salt okunurdur.
 */
export const AUDITION_CSS = `:root{--bg:#f7f7f5;--fg:#1d1d1b;--muted:#6b6b66;--card:#fff;--line:#deded8;--ok:#1f7a3a;--bad:#a8322d;--warn:#8a6d00;--accent:#2b5fab}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ececea;--muted:#a3a39c;--card:#20201f;--line:#3a3a37;--ok:#5fc27e;--bad:#e2766f;--warn:#d8b84a;--accent:#8ab0ee}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif}
header{padding:16px;border-bottom:1px solid var(--line)}h1{font-size:18px;margin:0 0 4px}
.muted{color:var(--muted)}main{padding:16px;display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(320px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;display:grid;gap:8px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.badge{border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:12px}
.passed,.approved{color:var(--ok)}.filtered,.error,.rejected{color:var(--bad)}.invalid,.risk{color:var(--warn)}
table{border-collapse:collapse;width:100%;font-size:12px}td{padding:2px 4px;border-top:1px solid var(--line)}td:first-child{color:var(--muted)}
audio{width:100%}button{font:inherit;padding:4px 10px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);cursor:pointer}
button[aria-pressed=true]{border-color:var(--accent);color:var(--accent)}input,textarea{font:inherit;width:100%;padding:4px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
`;

export const AUDITION_JS = `'use strict';
(function(){
const embedded=document.getElementById('state');
const live=!embedded;
let state=null;let filter='all';
function el(tag,attrs){const e=document.createElement(tag);for(const k in attrs||{}){if(k==='text')e.textContent=attrs[k];else if(k==='class')e.className=attrs[k];else e.setAttribute(k,String(attrs[k]));}for(let i=2;i<arguments.length;i++){const c=arguments[i];if(c!=null)e.append(c instanceof Node?c:document.createTextNode(String(c)));}return e;}
function fmt(v){if(v===null||v===undefined)return '—';if(typeof v==='number')return Number(v.toPrecision(4)).toString();if(Array.isArray(v))return v.map(fmt).join(', ');return String(v);}
function table(rows){const t=el('table');for(const r of rows){t.append(el('tr',{},el('td',{text:r[0]}),el('td',{text:fmt(r[1])})));}return t;}
async function load(){if(embedded)return JSON.parse(embedded.textContent);const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw new Error('durum okunamadı ('+r.status+')');return r.json();}
async function save(c,decision,labels,note,status){status.textContent='kaydediliyor…';try{const r=await fetch('/api/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({candidateId:c.candidateId,state:decision,labels:labels,note:note})});const body=await r.json();if(!r.ok)throw new Error(body.error||r.status);state=body;render();}catch(e){status.textContent='hata: '+e.message;}}
function controls(c){const box=el('div');const status=el('span',{class:'muted'});let decision=c.decision;
const labels=el('input',{placeholder:'etiketler (virgülle, a-z0-9-)',value:c.labels.join(', ')});
const note=el('textarea',{rows:2,placeholder:'not'});note.value=c.note||'';
const bar=el('div',{class:'toolbar'});
for(const d of ['approved','rejected','pending']){const b=el('button',{type:'button','aria-pressed':String(d===decision),text:{approved:'onayla',rejected:'reddet',pending:'bekliyor'}[d]});b.addEventListener('click',function(){decision=d;for(const x of bar.querySelectorAll('button[data-d]'))x.setAttribute('aria-pressed',String(x.getAttribute('data-d')===d));});b.setAttribute('data-d',d);bar.append(b);}
const submit=el('button',{type:'button',text:'kaydet'});submit.addEventListener('click',function(){const list=labels.value.split(',').map(function(s){return s.trim();}).filter(Boolean);save(c,decision,list,note.value.trim()||null,status);});
bar.append(submit,status);box.append(labels,note,bar);return box;}
function card(c){const card=el('section',{class:'card'});
card.append(el('div',{class:'row'},el('strong',{text:'#'+c.ordinal}),el('code',{text:c.candidateId||'—'}),el('span',{class:'badge '+c.state,text:c.state}),(c.decision?el('span',{class:'badge '+c.decision,text:c.decision+(c.by?' ('+c.by+')':'')}):null)));
if(c.reason)card.append(el('div',{class:c.state,text:c.reason}));
if(c.risks.length)card.append(el('div',{class:'risk',text:'risk: '+c.risks.join(', ')}));
if(c.audio&&c.candidateId)card.append(el('audio',{controls:'',preload:'none',src:live?'/audio/'+c.candidateId+'.wav':c.candidateId+'.wav'}));
card.append(table(Object.keys(c.values).map(function(k){return [k,c.values[k]];})));
if(c.descriptors){const d=c.descriptors;card.append(table([['süre (sn)',d.durationSeconds],['aktif (sn)',d.activeSeconds],['maks. momentary LUFS',d.maxMomentaryLufs],['true peak dBTP',d.truePeakDbtp],['centroid Hz',d.centroidHz],['perde Hz (YIN)',d.pitchHz],['perde güveni',d.pitchConfidence],['başlangıç/sn',d.onsetsPerSecond],['tık',d.clicks]]));}
if(c.checks&&c.checks.length)card.append(table(c.checks.map(function(k){return ['filtre '+k.filter+' '+k.kind,(k.pass?'geçti ':'düştü ')+fmt(k.measured)];})));
if(c.labels.length)card.append(el('div',{class:'muted',text:'etiketler: '+c.labels.join(', ')}));
if(c.note)card.append(el('div',{class:'muted',text:'not: '+c.note}));
if(live&&c.state==='passed')card.append(controls(c));
return card;}
function render(){const head=document.getElementById('summary');const s=state.summary;head.textContent=state.searchId+' — geçti '+s.passed+', filtrelendi '+s.filtered+', geçersiz '+s.invalid+', hata '+s.error+' · onaylı '+s.approved+', ret '+s.rejected+(live?'':' · salt okunur kopya')+(state.selection.state==='stale'?' · SEÇİM BAYAT':'');
const main=document.getElementById('list');main.replaceChildren();for(const c of state.candidates){if(filter==='all'||c.state===filter||c.decision===filter)main.append(card(c));}}
document.getElementById('filter').addEventListener('change',function(e){filter=e.target.value;render();});
load().then(function(s){state=s;render();},function(e){document.getElementById('summary').textContent=e.message;});
})();
`;

export function auditionHtml(title: string, embeddedState: string | null): string {
  const escapedTitle = title.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const data =
    embeddedState === null
      ? ''
      : `<script type="application/json" id="state">${embeddedState.replace(
          /</g,
          '\\u003c',
        )}</script>`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aday dinleme — ${escapedTitle}</title><link rel="stylesheet" href="app.css"></head>
<body><header><h1>Aday dinleme</h1><div id="summary" class="muted">yükleniyor…</div>
<label class="muted">göster <select id="filter"><option value="all">hepsi</option><option value="passed">passed</option><option value="filtered">filtered</option><option value="invalid">invalid</option><option value="error">error</option><option value="approved">onaylı</option><option value="rejected">reddedilen</option><option value="pending">bekleyen</option></select></label>
<p class="muted">Mekanik durum ve ölçümler karar DEĞİLDİR; onay/ret yalnız dinleyenin beyanıdır.</p></header>
<main id="list"></main>${data}<script src="app.js"></script></body></html>
`;
}
