const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const els = {
  form: $('#scanForm'),
  url: $('#siteUrl'),
  btn: $('#scanBtn'),
  btnText: $('#scanBtnText'),
  btnStop: $('#btnStop'),
  sitemapInfo: $('#sitemapInfo'),
  cacheInfo: $('#cacheInfo'),
  progressWrap: $('#progressWrap'),
  barPages: $('#barPages'),
  barLinks: $('#barLinks'),
  pctPages: $('#pctPages'),
  pctLinks: $('#pctLinks'),
  step: $('#stepText'),
  log: $('#log'),
  statPages: $('#statPages'),
  statLinks: $('#statLinks'),
  statChecked: $('#statChecked'),
  statBroken: $('#statBroken'),
  results: $('#results'),
  tableBody: $('#resultsBody'),
  emptyOk: $('#emptyOk'),
  emptyNone: $('#emptyNone'),
  btnCsv: $('#btnCsv'),
  btnExcel: $('#btnExcel'),
  btnClear: $('#btnClear'),
  btnClearCache: $('#btnClearCache'),
  btnClearAllCache: $('#btnClearAllCache'),
  delay: $('#delay'),
  pageLimit: $('#pageLimit'),
  kpiLimit: $('#kpiLimit'),
  skipExternal: $('#skipExternal'),
};

let state = {
  running: false,
  stopped: false,
  pages: [],
  scannedPages: [],
  scannedPagesSet: new Set(),
  linksMap: new Map(),
  checkedMap: new Map(), // linkUrl -> {code,is_broken,is_error}
  broken: [],
  abortController: null,
  failedPages: [], // {url, attempts, error, code}
  retryQueue: [],
  sitemapUrl: '',
  host: '',
};

// ===== Cache helpers =====
function getHostFromUrl(url){
  try{ return new URL(url).host.toLowerCase(); }catch{ return url.replace(/^https?:\/\//,'').split('/')[0].toLowerCase(); }
}
function cacheKey(host){ return `mp404_cache_${host}`; }
function loadCacheSync(host){
  try{
    const raw = localStorage.getItem(cacheKey(host));
    if(!raw) return null;
    const data = JSON.parse(raw);
    return data;
  }catch{ return null; }
}
async function loadCacheAsync(host){
  let data = loadCacheSync(host);
  if(data) return data;
  // try server
  try{
    const res = await api('get_cache', {host});
    if(res.cached && res.data){
      // also store to localStorage for speed
      try{ localStorage.setItem(cacheKey(host), JSON.stringify(res.data)); }catch{}
      return res.data;
    }
  }catch{}
  return null;
}
function saveCache(host){
  try{
    const data = {
      host,
      siteUrl: els.url.value.trim(),
      sitemapUrl: state.sitemapUrl || '',
      pages: state.pages || [],
      scannedPages: state.scannedPages || [],
      linksMap: [...state.linksMap.values()].map(v=>({url:v.url, text:v.text, sources:[...v.sources]})),
      checkedMap: Object.fromEntries(state.checkedMap || new Map()),
      broken: state.broken.map(b=>({url:b.url, code:b.code, text:b.text, sources:[...b.sources]})),
      failedPages: state.failedPages || [],
      skipExternal: els.skipExternal.checked,
      timestamp: Date.now(),
      dateStr: new Date().toISOString(),
    };
    localStorage.setItem(cacheKey(host), JSON.stringify(data));
    // mirror to server (fire and forget)
    api('save_cache', {host, data}).catch(()=>{});
  }catch(e){ console.warn('cache save fail', e); }
}
function clearCacheForHost(host){
  try{ localStorage.removeItem(cacheKey(host)); }catch{}
  api('clear_cache', {host}).catch(()=>{});
}
function clearAllCaches(){
  try{
    const keys = Object.keys(localStorage);
    let n=0;
    keys.forEach(k=>{ if(k.startsWith('mp404_cache_')){ localStorage.removeItem(k); n++; }});
    return n;
  }catch{ return 0; }
}
function formatCacheDate(ts){
  try{ return new Date(ts).toLocaleString('uk-UA'); }catch{ return '';}
}
function renderCacheInfo(host, cache, newCount){
  if(!cache){
    els.cacheInfo.style.display='none';
    els.cacheInfo.innerHTML='';
    return;
  }
  const scanned = (cache.scannedPages||[]).length;
  const total = (cache.pages||[]).length;
  const failed = (cache.failedPages||[]).length;
  const broken = (cache.broken||[]).length;
  const when = formatCacheDate(cache.timestamp);
  els.cacheInfo.style.display='block';
  els.cacheInfo.innerHTML = `
    <div class="cache-alert">
      <span style="font-size:18px">📦</span>
      <div style="flex:1">
        <div><b>Знайдено кеш для <code>${host}</code></b> — збережено ${when}</div>
        <div style="margin-top:4px">Перевірено сторінок: <b>${scanned}${total?` / ${total}`:''}</b> • Унікальних посилань: <b>${(cache.linksMap||[]).length}</b> • Битих 404: <b>${broken}</b> ${failed?`• Не завантажено: <b style="color:#b91c1c">${failed}</b>`:''}</div>
        ${typeof newCount==='number' ? `<div style="margin-top:6px;color:#0f172a"><b>Нових сторінок у sitemap:</b> ${newCount} — буде перевірено лише їх. <span style="color:#64748b">Решта візьметься з кешу.</span></div>` : ''}
        <div class="cache-actions">
          <span style="font-size:12px;color:#64748b">Кеш зберігається 7 днів в браузері та на сервері. Щоб перевірити все заново — очистіть кеш.</span>
        </div>
      </div>
    </div>`;
}
function updateCacheButtons(){
  const raw = els.url.value.trim();
  if(!raw){
    els.btnClearCache.style.display='none';
    els.btnClearAllCache.style.display='none';
    els.cacheInfo.style.display='none';
    return;
  }
  const host = getHostFromUrl(normalizeUrl(raw));
  const has = loadCacheSync(host);
  if(has){
    els.btnClearCache.style.display='inline-flex';
    els.btnClearAllCache.style.display='inline-flex';
    renderCacheInfo(host, has);
  } else {
    els.btnClearCache.style.display='none';
    // show all cache button if any cache exists
    const any = Object.keys(localStorage).some(k=>k.startsWith('mp404_cache_'));
    els.btnClearAllCache.style.display = any ? 'inline-flex' : 'none';
    els.cacheInfo.style.display='none';
  }
}

function log(msg, type='info'){
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.textContent = `[${time}] ${msg}`;
  if(type==='error') line.style.color = '#fca5a5';
  if(type==='ok') line.style.color = '#86efac';
  if(type==='warn') line.style.color = '#fde68a';
  els.log.appendChild(line);
  els.log.scrollTop = els.log.scrollHeight;
}
function setStep(t){ els.step.textContent = t; }
function setPct(pct, bar, txt){
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  bar.style.width = v + '%';
  txt.textContent = v + '%';
}
function sleep(ms){ return new Promise(r=>setTimeout(r, ms + Math.random()*120)); }

async function api(action, payload, signal){
  const res = await fetch('api.php', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({action, ...payload}),
    signal
  });
  const data = await res.json();
  if(!res.ok && !data.success) throw new Error(data.error || 'Помилка запиту');
  return data;
}

function normalizeUrl(v){
  v=v.trim();
  if(!v) return '';
  if(!/^https?:\/\//i.test(v)) v='https://'+v;
  try{ new URL(v); return v; }catch{ return ''; }
}

function updateStats(){
  els.statPages.textContent = state.pages.length;
  els.statLinks.textContent = state.linksMap.size;
  const broken = state.broken.length;
  els.statBroken.textContent = broken;
  els.statBroken.style.color = broken ? '#dc2626' : '';
}

function renderResults(){
  els.tableBody.innerHTML = '';
  if(state.broken.length===0){
    els.results.classList.add('active');
    els.emptyNone.style.display='none';
    if(state.linksMap.size>0){
      els.emptyOk.style.display='block';
    } else {
      els.emptyOk.style.display='none';
    }
    return;
  }
  els.emptyOk.style.display='none';
  els.emptyNone.style.display='none';
  els.results.classList.add('active');
  for(const b of state.broken){
    const tr = document.createElement('tr');
    const sources = [...b.sources].map(s=>`<a href="${s}" target="_blank" rel="noopener">${s}</a>`).join('<br>');
    const safeUrl = b.url.replace(/</g,'&lt;');
    const safeText = (b.text||'').replace(/</g,'&lt;');
    tr.innerHTML = `
      <td><div class="url"><a href="${safeUrl}" target="_blank" rel="noopener">${safeUrl}</a></div><div style="font-size:12px;color:#64748b;margin-top:4px">${safeText}</div></td>
      <td><span class="badge-404">404</span></td>
      <td class="source">${sources}</td>
    `;
    els.tableBody.appendChild(tr);
  }
}

function toCsv(){
  const esc = (v)=> String(v ?? '').replace(/"/g,'""');
  const rows = [['broken_url','http_code','anchor_text','source_pages']];
  for(const b of state.broken){
    rows.push([esc(b.url), b.code, esc(b.text||''), esc([...b.sources].join(' | '))]);
  }
  return rows.map(r=> r.map(v=>`"${v}"`).join(',')).join('\n');
}

function rowHpt(pairs){
  // pairs: [[текст, ширинаКолонкиWch], ...] → висота рядка, щоб ВЕСЬ вміст було видно
  // capacity із запасом 0.85 (пропорційний шрифт, кирилиця ширша) — краще трохи вищий рядок, ніж обрізаний текст
  const estLines = (text, wch)=>{
    const s = String(text ?? '');
    const cap = Math.max(8, wch * 0.85);
    let total = 0;
    for(const seg of s.split('\n')) total += Math.max(1, Math.ceil(seg.length / cap));
    return total;
  };
  let m = 1;
  for(const [t, w] of pairs) m = Math.max(m, estLines(t, w));
  return Math.min(409, Math.max(18, Math.round(m * 15))); // 15pt = рядок Calibri 11; 409 = ліміт Excel
}

function exportExcel(){
  if(state.broken.length===0 && state.failedPages.length===0){
    log('Немає даних для експорту (немає битих і немає помилок завантаження)', 'warn');
    return;
  }
  const siteHost = (()=>{ try{ return new URL(els.url.value).host }catch{ return state.host || 'site' } })();
  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA') + ' ' + now.toLocaleTimeString();

  if(typeof XLSX !== 'undefined'){
    const wb = XLSX.utils.book_new();

    // Sheet 1: 404 Links (if any)
    if(state.broken.length>0){
      const header = ['№','Бите посилання (404)','Код','Анкор текст','Знайдено на сторінці(ах)','К-сть джерел'];
      const rows = [header];
      state.broken.forEach((b,i)=>{
        rows.push([
          i+1,
          b.url,
          b.code,
          b.text || '',
          [...b.sources].join('\n'),
          b.sources.size
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [
        {wch: 5},
        {wch: 60},
        {wch: 8},
        {wch: 32},
        {wch: 60},
        {wch: 12},
      ];
      // NB: закріплення шапки (freeze panes) бібліотекою xlsx-js-style не пишеться — лишаємо autofilter
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:0,c:header.length-1}}) };
      const range = XLSX.utils.decode_range(ws['!ref']);
      for(let C=range.s.c; C<=range.e.c; ++C){
        const addr = XLSX.utils.encode_cell({r:0,c:C});
        if(!ws[addr]) continue;
        ws[addr].s = {
          font:{ bold:true, color:{rgb:"FFFFFF"} },
          fill:{ patternType:"solid", fgColor:{rgb:"2563EB"} },
          alignment:{ horizontal:"center", vertical:"center", wrapText:true }
        };
      }
      for(let R=1; R<=state.broken.length; ++R){
        // Колонка B: бите посилання — клікабельний гіперлінк + червоний підкреслений
        const addr2 = XLSX.utils.encode_cell({r:R,c:1});
        if(ws[addr2]){
          ws[addr2].l = { Target: ws[addr2].v };
          ws[addr2].s = { font:{ color:{rgb:"B91C1C"}, underline:true }, alignment:{ vertical:"top", wrapText:true } };
        }
        // Колонка C: код — по центру, жирний червоний
        const addrCode = XLSX.utils.encode_cell({r:R,c:2});
        if(ws[addrCode]) ws[addrCode].s = { font:{ bold:true, color:{rgb:"B91C1C"} }, alignment:{ horizontal:"center", vertical:"top" } };
        // Колонка D: анкор — wrap
        const addrText = XLSX.utils.encode_cell({r:R,c:3});
        if(ws[addrText]) ws[addrText].s = { alignment:{ vertical:"top", wrapText:true } };
        // Колонка E: джерела (кілька URL через \n) — wrap, зверху
        const addr = XLSX.utils.encode_cell({r:R,c:4});
        if(ws[addr]) ws[addr].s = { alignment:{ vertical:"top", wrapText:true } };
        // Колонка F: кількість — по центру
        const addrN = XLSX.utils.encode_cell({r:R,c:5});
        if(ws[addrN]) ws[addrN].s = { alignment:{ horizontal:"center", vertical:"top" } };
      }
      ws['!rows'] = [{hpt: 32}];
      // Автовисота кожного рядка під його вміст: URL (60), анкор (32), джерела (60)
      state.broken.forEach((b)=>{
        ws['!rows'].push({hpt: rowHpt([[b.url, 60], [b.text || '', 32], [[...b.sources].join('\n'), 60]])});
      });
      XLSX.utils.book_append_sheet(wb, ws, '404 Links');
    } else {
      // placeholder sheet
      const ws = XLSX.utils.aoa_to_sheet([['Битих посилань (404) не знайдено — чудово!'], ['Сайт', els.url.value], ['Дата', dateStr]]);
      ws['!cols'] = [{wch:40},{wch:60}];
      XLSX.utils.book_append_sheet(wb, ws, '404 Links');
    }

    // Sheet 2: Summary
    const summary = [
      ['MP Find 404 Links — звіт'],
      ['Сайт', els.url.value],
      ['Хост', siteHost],
      ['Sitemap', state.sitemapUrl || ''],
      ['Дата', dateStr],
      ['Сторінок у sitemap', state.pages.length],
      ['Перевірено сторінок (унікально)', state.scannedPages.length],
      ['Не завантажено сторінок', state.failedPages.length],
      ['Унікальних посилань зібрано', state.linksMap.size],
      ['Перевірено посилань (checkedMap)', state.checkedMap.size],
      ['Битих посилань (404)', state.broken.length],
      ['Кеш використано', state._cacheUsed ? 'так' : 'ні'],
      ['Затримка', els.delay.value + ' мс'],
      ['Режим', els.skipExternal.checked ? 'Тільки внутрішні' : 'Всі посилання'],
      [],
      ['Примітка','Бите = строго HTTP 404. Інші 4xx/5xx показані лише в логах.'],
      ['Кеш','Зберігається 7 днів у localStorage + /cache/site_*.json на сервері. При повторному запуску перевіряються лише нові сторінки з sitemap.']
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [{wch: 32},{wch:60}];
    ws2['!merges'] = [{s:{r:0,c:0}, e:{r:0,c:1}}];
    ws2['A1'].s = { font:{ bold:true, sz:14, color:{rgb:"0F172A"} }, alignment:{ vertical:"center" } };
    // Автовисота рядків зведення під вміст колонки B (60)
    ws2['!rows'] = [{hpt:26}];
    for(let R=1; R<summary.length; ++R){
      const vCell = XLSX.utils.encode_cell({r:R,c:1});
      const h = (ws2[vCell] && ws2[vCell].v) ? rowHpt([[String(ws2[vCell].v), 60]]) : 15;
      ws2['!rows'].push({hpt: h});
    }
    // Перша колонка (назви полів) — жирна, друга — з переносами + клікабельні URL
    for(let R=1; R<summary.length; ++R){
      const a = XLSX.utils.encode_cell({r:R,c:0});
      const b = XLSX.utils.encode_cell({r:R,c:1});
      if(ws2[a] && ws2[a].v) ws2[a].s = { font:{ bold:true, color:{rgb:"334155"} }, alignment:{ vertical:"top" } };
      if(ws2[b] && ws2[b].v){
        ws2[b].s = { alignment:{ vertical:"top", wrapText:true } };
        if(/^https?:\/\//i.test(String(ws2[b].v))) {
          ws2[b].l = { Target: String(ws2[b].v) };
          ws2[b].s = { font:{ color:{rgb:"0563C1"}, underline:true }, alignment:{ vertical:"top", wrapText:true } };
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, ws2, 'Зведення');

    // Sheet 3: Не завантажені сторінки (з причиною)
    if(state.failedPages.length>0){
      const hdr = ['№','URL сторінки (не завантажена)','Причина / помилка','HTTP код','Спроби','Остання спроба'];
      const rows = [hdr];
      state.failedPages.forEach((f,i)=>{
        rows.push([
          i+1,
          f.url,
          f.error || 'Не вдалося завантажити',
          f.code || '',
          f.attempts || 3,
          f.lastAt ? new Date(f.lastAt).toLocaleString('uk-UA') : dateStr
        ]);
      });
      const ws3 = XLSX.utils.aoa_to_sheet(rows);
      ws3['!cols'] = [
        {wch:5},
        {wch:70},
        {wch:40},
        {wch:10},
        {wch:10},
        {wch:20},
      ];
      // NB: freeze panes не підтримується writer'ом — лишаємо autofilter
      ws3['!autofilter'] = { ref: XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:0,c:hdr.length-1}}) };
      const range3 = XLSX.utils.decode_range(ws3['!ref']);
      for(let C=range3.s.c; C<=range3.e.c; ++C){
        const addr = XLSX.utils.encode_cell({r:0,c:C});
        if(!ws3[addr]) continue;
        ws3[addr].s = {
          font:{ bold:true, color:{rgb:"FFFFFF"} },
          fill:{ patternType:"solid", fgColor:{rgb:"B91C1C"} },
          alignment:{ horizontal:"center", vertical:"center", wrapText:true }
        };
      }
      // highlight code 404 etc
      for(let R=1; R<=state.failedPages.length; ++R){
        const a = XLSX.utils.encode_cell({r:R,c:2});
        if(ws3[a]) ws3[a].s = { font:{ color:{rgb:"7F1D1D"} }, alignment:{ wrapText:true, vertical:"top" } };
        const b = XLSX.utils.encode_cell({r:R,c:1});
        if(ws3[b]){
          ws3[b].l = { Target: String(ws3[b].v) };
          ws3[b].s = { font:{ color:{rgb:"0563C1"}, underline:true }, alignment:{ wrapText:true, vertical:"top" } };
        }
        const c = XLSX.utils.encode_cell({r:R,c:3});
        if(ws3[c]) ws3[c].s = { font:{ bold:true }, alignment:{ horizontal:"center", vertical:"top" } };
      }
      ws3['!rows'] = [{hpt: 32}];
      // Автовисота кожного рядка під його вміст: URL (70), причина (40)
      state.failedPages.forEach((f)=>{
        ws3['!rows'].push({hpt: rowHpt([[f.url, 70], [f.error || '', 40]])});
      });
      XLSX.utils.book_append_sheet(wb, ws3, 'Не завантажені');
    }

    const fname = `404-links-${siteHost}-${now.toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname, { cellStyles:true });
    log(`Excel вивантажено: ${fname} (${state.broken.length} битих, ${state.failedPages.length} не завантажено)`, 'ok');
    return;
  }

  // Fallback HTML xls (коли CDN недоступний): повноцінний стилізований звіт
  const escHtml = (v)=> String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>404 Links</x:Name><x:WorksheetOptions><x:FreezePanes/><x:SplitHorizontal>1</x:SplitHorizontal><x:TopRowBottomPane>1</x:TopRowBottomPane></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#0f172a}
  h2{font-size:15pt;color:#0f172a;margin:0 0 4px} p.meta{color:#475569;font-size:10pt;margin:0 0 12px}
  h3{font-size:12pt;margin:16px 0 6px} table{border-collapse:collapse;width:100%}
  th{background:#2563eb;color:#fff;font-weight:bold;text-align:center;vertical-align:middle;border:1px solid #1e40af;padding:8px}
  td{vertical-align:top;border:1px solid #cbd5e1;padding:6px 8px;word-break:break-all}
  td.c{text-align:center;white-space:nowrap} td.code{color:#b91c1c;font-weight:bold;text-align:center}
  a{color:#0563c1} .note{background:#eff6ff;border:1px solid #dbeafe;padding:8px;font-size:10pt}
  </style></head><body>`;
  html += `<h2>MP Find 404 Links — ${escHtml(els.url.value)} — ${escHtml(dateStr)}</h2>`;
  html += `<p class="meta">Сторінок: ${state.pages.length} | Перевірено: ${state.scannedPages.length} | Не завантажено: ${state.failedPages.length} | Посилань: ${state.linksMap.size} | Битих 404: ${state.broken.length}</p>`;
  html += `<h3>Биті посилання (404)</h3><table cellspacing="0" cellpadding="6"><colgroup><col style="width:40px"><col style="width:420px"><col style="width:60px"><col style="width:220px"><col style="width:420px"></colgroup><thead><tr><th>№</th><th>Бите посилання</th><th>Код</th><th>Анкор</th><th>Знайдено на</th></tr></thead><tbody>`;
  if(!state.broken.length) html += `<tr><td colspan="5" style="text-align:center;color:#15803d">✅ Битих посилань (404) не знайдено</td></tr>`;
  state.broken.forEach((b,i)=>{
    const src = [...b.sources].map(s=>`<a href="${escHtml(s)}">${escHtml(s)}</a>`).join('<br>');
    html += `<tr><td class="c">${i+1}</td><td><a href="${escHtml(b.url)}">${escHtml(b.url)}</a></td><td class="code">404</td><td>${escHtml(b.text||'')}</td><td>${src}</td></tr>`;
  });
  html += `</tbody></table>`;
  if(state.failedPages.length){
    html += `<h3>Не завантажені сторінки</h3><table cellspacing="0" cellpadding="6"><colgroup><col style="width:40px"><col style="width:480px"><col style="width:280px"><col style="width:60px"><col style="width:60px"></colgroup><thead><tr><th>№</th><th>URL</th><th>Причина</th><th>Код</th><th>Спроби</th></tr></thead><tbody>`;
    state.failedPages.forEach((f,i)=>{
      html += `<tr><td class="c">${i+1}</td><td><a href="${escHtml(f.url)}">${escHtml(f.url)}</a></td><td>${escHtml(f.error||'')}</td><td class="c">${escHtml(f.code||'')}</td><td class="c">${escHtml(f.attempts)}</td></tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</body></html>`;
  const blob = new Blob([html], {type:'application/vnd.ms-excel;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `404-links-${siteHost}-${new Date().toISOString().slice(0,10)}.xls`;
  a.click();
  URL.revokeObjectURL(a.href);
  log('Excel (fallback .xls) вивантажено', 'ok');
}

async function runScan(siteUrl){
  state.running = true;
  state.stopped = false;
  state.pages = [];
  state.scannedPages = [];
  state.scannedPagesSet = new Set();
  state.linksMap = new Map();
  state.checkedMap = new Map();
  state.broken = [];
  state.failedPages = [];
  state.retryQueue = [];
  state.sitemapUrl = '';
  state.host = getHostFromUrl(siteUrl);
  state._cacheUsed = false;
  state.abortController = new AbortController();

  els.btn.disabled = true;
  els.btnText.textContent = 'Скануємо...';
  els.btnStop.style.display = 'inline-flex';
  els.progressWrap.classList.add('active');
  els.results.classList.remove('active');
  els.tableBody.innerHTML='';
  els.emptyOk.style.display='none';
  els.emptyNone.style.display='none';
  els.log.innerHTML='';
  setPct(0, els.barPages, els.pctPages);
  setPct(0, els.barLinks, els.pctLinks);
  els.statChecked.textContent='0';
  updateStats();
  els.sitemapInfo.innerHTML='';

  const delay = parseInt(els.delay.value,10) || 350;
  const skipExternal = els.skipExternal.checked;
  let siteHost = state.host;

  try{
    setStep('Шукаємо sitemap.xml...');
    log('Пошук sitemap для ' + siteUrl);
    const rawLimit = els.pageLimit.value;
    const limit = rawLimit === '0' ? 0 : (parseInt(rawLimit,10) || 500);
    const sitemapData = await api('parse_sitemap', {url: siteUrl, limit}, state.abortController.signal);
    if(state.stopped) throw new Error('Зупинено користувачем');
    if(!sitemapData.success) throw new Error(sitemapData.error);
    state.pages = sitemapData.pages || [];
    state.sitemapUrl = sitemapData.sitemap_url;
    log(`Знайдено sitemap: ${sitemapData.sitemap_url}`, 'ok');
    log(`Знайдено сторінок: ${sitemapData.total}${sitemapData.limited ? ' (обмежено до '+sitemapData.limit+')' : ''}`, 'ok');
    els.sitemapInfo.innerHTML = `<div class="alert alert-ok">✔ Sitemap: <a href="${sitemapData.sitemap_url}" target="_blank">${sitemapData.sitemap_url}</a> — сторінок ${state.pages.length}${sitemapData.limited ? ' / '+sitemapData.total : ''}</div>`;
    if(state.pages.length===0) throw new Error('Sitemap порожній — немає сторінок для перевірки');
    updateStats();

    // ===== CACHE: try to load previous run =====
    let queue = [];
    let useCache = false;
    const cached = await loadCacheAsync(siteHost);
    if(cached && !cached._stale && cached.sitemapUrl === state.sitemapUrl && cached.skipExternal === skipExternal){
      // restore scannedPages set
      const prevScanned = new Set(cached.scannedPages || []);
      const prevFailedPermanent = new Set((cached.failedPages||[]).filter(f=>f.attempts>=3).map(f=>f.url));
      const newPages = state.pages.filter(p => !prevScanned.has(p) && !prevFailedPermanent.has(p));
      const cachedPagesCount = (cached.pages||[]).length;
      // if cache has data and newPages < total, use it
      if((cached.linksMap && cached.linksMap.length>0) || (cached.scannedPages && cached.scannedPages.length>0)){
        if(newPages.length < state.pages.length){
          useCache = true;
          state._cacheUsed = true;
          state.scannedPages = [...(cached.scannedPages||[])];
          state.scannedPagesSet = new Set(state.scannedPages);
          // restore linksMap
          for(const lm of (cached.linksMap||[])){
            state.linksMap.set(lm.url, {url:lm.url, text:lm.text, sources:new Set(lm.sources)});
          }
          // restore checkedMap
          if(cached.checkedMap){
            for(const [k,v] of Object.entries(cached.checkedMap)){
              state.checkedMap.set(k, v);
            }
          }
          // restore broken
          state.broken = (cached.broken||[]).map(b=>({url:b.url, code:b.code, text:b.text, sources:new Set(b.sources)}));
          // restore failedPages (keep previous, will append new failures)
          state.failedPages = [...(cached.failedPages||[])];
          // queue is only new pages
          queue = newPages.map(u=>({url:u, attempts:0}));
          log(`📦 Кеш: відновлено ${state.scannedPages.length} сторінок, ${state.linksMap.size} посилань, ${state.broken.length} битих. Нових сторінок: ${newPages.length}`, 'ok');
          renderCacheInfo(siteHost, cached, newPages.length);
          if(newPages.length===0){
            log('Всі сторінки вже перевірені — сканування сторінок пропущено, перевіряємо лише нові посилання (якщо є)', 'ok');
          }
          updateStats();
        } else if(newPages.length===state.pages.length){
          log('Кеш знайдено, але всі сторінки нові або кеш іншого режиму — повна перевірка', 'info');
          queue = state.pages.map(u=>({url:u, attempts:0}));
        }
      } else {
        queue = state.pages.map(u=>({url:u, attempts:0}));
      }
    } else {
      if(cached && cached._stale) log('Кеш застарілий (>7 днів) — ігноруємо', 'warn');
      else if(cached) log('Кеш для іншого sitemap/режиму — повна перевірка', 'info');
      queue = state.pages.map(u=>({url:u, attempts:0}));
    }
    if(!useCache && queue.length===0) queue = state.pages.map(u=>({url:u, attempts:0}));

    // Phase 1: scan pages for links with retry queue
    let totalPages = state.pages.length;
    let scannedNew = 0;
    let totalToScan = queue.length;
    // For progress, we use scannedPages.length + queue progress
    let retryRound = 0;
    state.failedPages = state.failedPages || [];
    // keep a map for saving: we already have scannedPages set

    async function processQueue(initialLabel){
      while(queue.length>0){
        if(state.stopped) throw new Error('Зупинено користувачем');
        if(!state.running) throw new Error('Зупинено користувачем');
        const item = queue.shift();
        const idx = state.scannedPages.length + 1;
        const totalHint = useCache ? `${state.scannedPages.length}/${totalPages} + ${totalToScan} нових` : `${idx}/${totalPages}`;
        setStep(`${initialLabel}: ${idx} / ${totalPages} ${useCache?`(нових: ${scannedNew}/${totalToScan})`:''}`);
        log(`Скануємо сторінку ${idx}/${totalPages}: ${item.url}${item.attempts?` (спроба ${item.attempts+1})`:''}${useCache?' [кеш-режим]':''}`);
        try{
          const data = await api('scan_page', {page_url: item.url}, state.abortController.signal);
          if(state.stopped) throw new Error('Зупинено користувачем');
          if(data.success){
            const links = data.links || [];
            const skipped = data.skipped_share || 0;
            log(`→ знайдено посилань: ${links.length}${skipped?` (пропущено шарингів: ${skipped})`:''}`, 'info');
            for(const l of links){
              if(skipExternal){
                try{
                  const h = new URL(l.url).host.toLowerCase();
                  if(h !== siteHost) continue;
                }catch{}
              }
              if(!state.linksMap.has(l.url)){
                state.linksMap.set(l.url, {url:l.url, text:l.text, sources:new Set([item.url])});
              } else {
                state.linksMap.get(l.url).sources.add(item.url);
              }
            }
            state.scannedPages.push(item.url);
            state.scannedPagesSet.add(item.url);
            scannedNew++;
            saveCache(siteHost);
          } else {
            log(`⚠ ${item.url}: ${data.error} — додано в чергу повтору`, 'warn');
            item.attempts++;
            item.error = data.error || 'Не вдалося завантажити';
            item.code = data.code || '';
            item.lastAt = Date.now();
            if(item.attempts < 3){
              state.retryQueue.push(item);
            } else {
              state.failedPages.push(item);
              state.scannedPages.push(item.url); // mark as processed to avoid infinite loop
              state.scannedPagesSet.add(item.url);
              scannedNew++;
              log(`✖ Пропускаємо після ${item.attempts} спроб: ${item.url} — ${item.error}`, 'error');
              saveCache(siteHost);
            }
          }
        }catch(e){
          if(e.name === 'AbortError' || state.stopped) throw new Error('Зупинено користувачем');
          log(`✖ Помилка сторінки ${item.url}: ${e.message} — додано в чергу повтору`, 'error');
          item.attempts++;
          item.error = e.message;
          item.code = '';
          item.lastAt = Date.now();
          if(item.attempts < 3){
            state.retryQueue.push(item);
          } else {
            state.failedPages.push(item);
            state.scannedPages.push(item.url);
            state.scannedPagesSet.add(item.url);
            scannedNew++;
            saveCache(siteHost);
          }
        }
        // progress
        let pct;
        if(!useCache){
          pct = (state.scannedPages.length/totalPages)*100;
          if(state.retryQueue.length>0 && queue.length===0) pct = Math.min(92, pct);
        } else {
          // when using cache, progress = scannedPages.length / totalPages
          pct = (state.scannedPages.length/totalPages)*100;
        }
        setPct(pct, els.barPages, els.pctPages);
        updateStats();
        els.statChecked.textContent = String(state.checkedMap.size);
        await sleep(delay);
      }
    }

    await processQueue(useCache ? 'Скануємо нові сторінки' : 'Збираємо посилання');

    // Retry loop
    retryRound = 1;
    while(state.retryQueue.length>0 && retryRound<=2){
      if(state.stopped) throw new Error('Зупинено користувачем');
      const toRetry = [...state.retryQueue];
      state.retryQueue = [];
      queue = toRetry;
      const retryCount = toRetry.length;
      log(`— Повторна перевірка ${retryCount} сторінок, що не вдалося (раунд ${retryRound}) —`, 'warn');
      setStep(`Повторна перевірка: ${retryCount} сторінок (раунд ${retryRound})`);
      await sleep(1200);
      await processQueue('Повтор');
      retryRound++;
    }

    if(state.failedPages.length>0){
      log(`Не вдалося перевірити сторінок: ${state.failedPages.length} (після 3 спроб, пропущено)`, 'warn');
      els.sitemapInfo.innerHTML += `<div class="alert alert-info">⚠ Не вдалося завантажити ${state.failedPages.length} сторінок після 3 спроб — пропущено. Див. аркуш «Не завантажені» в Excel.</div>`;
    }
    setPct(100, els.barPages, els.pctPages);
    saveCache(siteHost);

    log(`Зібрано унікальних посилань: ${state.linksMap.size} (відновлено з кешу + нових)`, 'ok');
    if(state.linksMap.size===0){
      setStep(state.stopped ? 'Зупинено' : 'Готово — посилань не знайдено');
      setPct(100, els.barLinks, els.pctLinks);
      renderResults();
      if(!state.stopped) els.sitemapInfo.innerHTML += `<div class="alert alert-info">На сторінках не знайдено посилань для перевірки.</div>`;
      saveCache(siteHost);
      return;
    }

    if(state.stopped) throw new Error('Зупинено користувачем');

    // Phase 2: check links for 404 with cache
    const allLinksArr = [...state.linksMap.values()];
    // filter already checked
    const toCheck = allLinksArr.filter(l => !state.checkedMap.has(l.url));
    const alreadyChecked = allLinksArr.length - toCheck.length;
    if(alreadyChecked>0){
      log(`Кеш посилань: ${alreadyChecked} вже перевірено, перевіряємо лише ${toCheck.length} нових`, 'ok');
      // restore broken count from cache? already done
      // For already checked, we already have broken array, but need to ensure broken reflects checkedMap
      // Rebuild broken from checkedMap where is_broken true? But we already restored broken, so keep
    }
    let checkedInThisRun = 0;
    let brokenCountInRun = 0;
    // we keep state.broken already, but will append new broken found
    setStep(`Перевіряємо посилання (0/${toCheck.length})... ${alreadyChecked ? `+ ${alreadyChecked} з кешу`:''}`);
    setPct(alreadyChecked>0 ? (alreadyChecked/allLinksArr.length)*100 : 0, els.barLinks, els.pctLinks);
    els.statChecked.textContent = String(state.checkedMap.size);
    // If no new links to check, just finish
    if(toCheck.length>0){
      for(let i=0;i<toCheck.length;i++){
        if(state.stopped) throw new Error('Зупинено користувачем');
        if(!state.running) throw new Error('Зупинено користувачем');
        const link = toCheck[i];
        setStep(`Перевірка: ${i+1} / ${toCheck.length} (всього ${allLinksArr.length})`);
        log(`Перевіряємо ${link.url}`);
        try{
          const res = await api('check_link', {link_url: link.url}, state.abortController.signal);
          if(state.stopped) throw new Error('Зупинено користувачем');
          if(res.skipped){
            log(`⊘ Пропущено шаринг (не перевіряємо): ${link.url}`, 'info');
            state.checkedMap.set(link.url, {code:0, is_broken:false, is_error:false, skipped:true, effective_url:res.effective_url});
            if((i+1)%5===0) saveCache(siteHost);
          } else {
            state.checkedMap.set(link.url, {code:res.code, is_broken:res.is_broken, is_error:res.is_error, effective_url:res.effective_url});
            if(res.is_broken){
              brokenCountInRun++;
              state.broken.push({url: link.url, code: res.code, text: link.text, sources: link.sources});
              log(`→ 404 BROKEN: ${link.url} (на сторінці: ${[...link.sources].join(', ')})`, 'error');
            } else if(res.is_error){
              log(`→ ${res.code} (не 404): ${link.url}`, 'info');
            }
            // periodic save
            if((i+1)%5===0) saveCache(siteHost);
          }
        }catch(e){
          if(e.name === 'AbortError' || state.stopped) throw new Error('Зупинено користувачем');
          log(`✖ Помилка перевірки ${link.url}: ${e.message}`, 'error');
          state.checkedMap.set(link.url, {code:0, is_broken:false, is_error:true, error:e.message});
        }
        checkedInThisRun++;
        const totalCheckedNow = state.checkedMap.size;
        els.statChecked.textContent = String(totalCheckedNow);
        els.statBroken.textContent = String(state.broken.length);
        setPct((totalCheckedNow/allLinksArr.length)*100, els.barLinks, els.pctLinks);
        if(state.broken.length>0 && checkedInThisRun % 5===0) renderResults();
        await sleep(delay + 50);
      }
    }
    saveCache(siteHost);
    setPct(100, els.barLinks, els.pctLinks);
    const totalBroken = state.broken.length;
    const totalFailed = state.failedPages.length;
    setStep(`Готово — перевірено ${state.checkedMap.size}/${allLinksArr.length} посилань, битих: ${totalBroken}${totalFailed?`, не завантажено: ${totalFailed}`:''}`);
    log(`Завершено. Битих посилань (404): ${totalBroken}${useCache?` (з кешу + нових ${brokenCountInRun})`:''}`, totalBroken?'error':'ok');
    if(totalFailed>0) log(`Не завантажено сторінок: ${totalFailed} — див. Excel аркуш «Не завантажені»`, 'warn');
    renderResults();
    if(totalBroken===0 && totalFailed===0){
      els.sitemapInfo.innerHTML += `<div class="alert alert-ok">Чудово! Битих посилань (404) не знайдено. Перевірено ${state.checkedMap.size} посилань на ${state.scannedPages.length} сторінках.</div>`;
    } else if(totalBroken>0){
      els.sitemapInfo.innerHTML += `<div class="alert alert-error">Знайдено битих посилань: ${totalBroken}. ${totalFailed?`Не завантажено: ${totalFailed}. `:''}Дивіться таблицю та експортуйте Excel (3 аркуші).</div>`;
    } else if(totalFailed>0){
      els.sitemapInfo.innerHTML += `<div class="alert alert-info">Битих не знайдено, але ${totalFailed} сторінок не вдалося завантажити — перевірте Excel «Не завантажені».</div>`;
    }

  }catch(e){
    const isStop = e.message === 'Зупинено користувачем' || state.stopped;
    if(isStop){
      log(`Перевірку зупинено користувачем — прогрес збережено в кеш`, 'warn');
      saveCache(state.host);
      els.sitemapInfo.innerHTML += `<div class="alert alert-info">⏹ Перевірку зупинено. Зібрано ${state.linksMap.size} посилань, битих: ${state.broken.length}, не завантажено: ${state.failedPages.length}. При наступному запуску цього ж сайту буде перевірено лише нові сторінки. Можна експортувати часткові результати.</div>`;
      setStep('Зупинено (кеш збережено)');
      renderResults();
      if(state.broken.length>0 || state.failedPages.length>0) els.results.classList.add('active');
    } else {
      log(`Помилка: ${e.message}`, 'error');
      els.sitemapInfo.innerHTML += `<div class="alert alert-error">✖ ${e.message}</div>`;
      setStep('Помилка');
      saveCache(state.host);
    }
  }finally{
    state.running = false;
    els.btn.disabled = false;
    els.btnText.textContent = 'Перевірити';
    els.btnStop.style.display = 'none';
    state.abortController = null;
    updateCacheButtons();
    if(state.host) saveCache(state.host);
  }
}

// Events
els.form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const raw = els.url.value.trim();
  const url = normalizeUrl(raw);
  if(!url){
    els.sitemapInfo.innerHTML = `<div class="alert alert-error">Введіть коректний URL, наприклад https://example.com</div>`;
    return;
  }
  els.url.value = url;
  runScan(url);
});

els.btnStop.addEventListener('click', ()=>{
  if(!state.running) return;
  state.stopped = true;
  state.running = false;
  if(state.abortController) state.abortController.abort();
  els.btnStop.disabled = true;
  els.btnStop.textContent = 'Зупиняємо...';
  log('— Натиснуто Зупинити. Завершуємо поточний запит і зберігаємо кеш...', 'warn');
  setTimeout(()=>{ els.btnStop.disabled=false; els.btnStop.textContent='⏹ Зупинити перевірку'; }, 1500);
});

els.btnCsv.addEventListener('click', ()=>{
  if(state.broken.length===0){
    log('Немає битих посилань для CSV', 'warn');
    return;
  }
  const csv = toCsv();
  const blob = new Blob(["\uFEFF"+csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'broken-404-links.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  log('CSV вивантажено', 'ok');
});

els.btnExcel.addEventListener('click', exportExcel);

els.btnClear.addEventListener('click', ()=>{
  state.stopped = true;
  state.running=false;
  if(state.abortController) try{ state.abortController.abort(); }catch{}
  state.pages=[];
  state.scannedPages=[];
  state.scannedPagesSet=new Set();
  state.linksMap=new Map();
  state.checkedMap=new Map();
  state.broken=[];
  state.failedPages=[];
  state.retryQueue=[];
  els.progressWrap.classList.remove('active');
  els.results.classList.remove('active');
  els.sitemapInfo.innerHTML='';
  els.cacheInfo.style.display='none';
  els.log.innerHTML='';
  els.url.value='';
  setPct(0, els.barPages, els.pctPages);
  setPct(0, els.barLinks, els.pctLinks);
  updateStats();
  els.statChecked.textContent='0';
  els.btnStop.style.display='none';
});

els.btnClearCache.addEventListener('click', ()=>{
  const raw = els.url.value.trim();
  const host = raw ? getHostFromUrl(normalizeUrl(raw)) : state.host;
  if(!host){
    log('Вкажіть URL сайту для очищення кешу', 'warn');
    return;
  }
  if(confirm(`Очистити кеш для ${host}? При наступному запуску перевірятимуться всі сторінки заново.`)){
    clearCacheForHost(host);
    try{ localStorage.removeItem(cacheKey(host)); }catch{}
    log(`Кеш для ${host} очищено`, 'ok');
    els.cacheInfo.innerHTML=`<div class="alert alert-info">Кеш для <b>${host}</b> очищено.</div>`;
    setTimeout(()=>{ els.cacheInfo.style.display='none'; updateCacheButtons(); }, 2500);
    updateCacheButtons();
  }
});

els.btnClearAllCache.addEventListener('click', ()=>{
  if(!confirm('Очистити весь кеш для всіх сайтів? Всі збережені прогреси будуть видалені.')) return;
  const nLocal = clearAllCaches();
  api('clear_all_cache', {}).then(r=> {
    log(`Весь кеш очищено: локально ${nLocal}, на сервері ${r.cleared||0}`, 'ok');
    els.cacheInfo.innerHTML=`<div class="alert alert-ok">Весь кеш очищено.</div>`;
    setTimeout(()=> els.cacheInfo.style.display='none', 2000);
    updateCacheButtons();
  }).catch(()=> {
    log(`Локальний кеш очищено (${nLocal})`, 'ok');
    updateCacheButtons();
  });
});

els.url.addEventListener('input', updateCacheButtons);
els.url.addEventListener('change', updateCacheButtons);
 // sync KPI limit display
if(els.pageLimit && els.kpiLimit){
  const syncKpi = ()=> {
    const v = els.pageLimit.value;
    els.kpiLimit.textContent = v==='0' ? '∞' : v;
  };
  els.pageLimit.addEventListener('change', syncKpi);
  syncKpi();
}
 // initial
updateCacheButtons();

// Demo preset
document.addEventListener('click', (e)=>{
  const t = e.target.closest('[data-demo]');
  if(t){
    e.preventDefault();
    els.url.value = t.getAttribute('data-demo');
    updateCacheButtons();
    els.url.focus();
  }
});

// Enter handling
els.url.addEventListener('keydown', (e)=>{
  if(e.key==='Enter' && !state.running){
    // let form submit
  }
});
