<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MP Find 404 Links — пошук битих посилань через sitemap</title>
<meta name="description" content="MP Find 404 Links — онлайн-сервіс перевірки битих посилань (404) на сайті через sitemap.xml. Без перезавантаження, делікатно для хостингу.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
<link rel="icon" href="assets/img/logo-512x512.png">
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
</head>
<body>
<header class="header">
  <div class="container">
    <div class="header-inner">
      <div class="logo">
        <div class="logo-mark"><img src="assets/img/logo-512x512.png" alt="Перевірка битих посилань | thePetrov.com"></div>
        <div>
          <div style="line-height:1">MP Find 404 Links | thePetrov.com</div>
          <small>Перевірка битих посилань</small>
        </div>
      </div>
      <nav class="nav">
        <span class="badge">AJAX • без перезавантаження</span>
        <a href="#how">Як працює</a>
      </nav>
    </div>
  </div>
</header>

<main class="container">
  <section class="hero">
    <div class="hero-grid">
      <div>
        <h1 class="h1">Знайдіть усі биті посилання <span style="background:linear-gradient(90deg,#2563eb,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent">404</span> на сайті</h1>
        <p class="lead">Введіть домен — сервіс знайде <b>sitemap.xml</b>, просканує кожну сторінку (віджети та контент) і покаже кожне неробоче посилання разом із сторінкою, де воно знаходиться.</p>

        <div class="card card-pad">
          <form id="scanForm" autocomplete="off" novalidate>
            <label class="form-label" for="siteUrl">Адреса сайту</label>
            <div class="input-row">
              <div class="input-wrap">
                <span class="input-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>
                </span>
                <input id="siteUrl" class="input" type="text" placeholder="https://example.com" required spellcheck="false" inputmode="url">
              </div>
              <button id="scanBtn" class="btn btn-primary" type="submit">
                <span id="scanBtnText">Перевірити</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </div>

            <div class="controls">
              <label class="control" title="Затримка між запитами — захист від блокування хостингом">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Затримка
                <select id="delay">
                  <option value="200">0.2с (швидко)</option>
                  <option value="350" selected>0.35с (рекомендовано)</option>
                  <option value="600">0.6с (делікатно)</option>
                  <option value="1000">1.0с (макс. безпечно)</option>
                </select>
              </label>
              <label class="control has-info" title="Скільки сторінок з sitemap перевіряти за один запуск. Більше — довше та більше навантаження">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h10M7 12h10M7 16h10"/></svg>
                Ліміт сторінок
                <select id="pageLimit">
                  <option value="500" selected>500 (за замовч.)</option>
                  <option value="1000">1 000</option>
                  <option value="2000">2 000</option>
                  <option value="5000">5 000</option>
                  <option value="10000">10 000</option>
                  <option value="0">Без ліміту</option>
                </select>
                <span class="info-tip" tabindex="0" aria-label="Чому є ліміт" data-tip="Ліміт захищає хостинг від блокування та браузер від зависання. 500 сторінок × 350мс ≈ 3 хв на збір + перевірка посилань. Для великих сайтів виберіть 2000–5000 або Без ліміту і використовуйте кеш: повторний запуск перевірить лише нові сторінки.">?</span>
              </label>
              <label class="control has-info">
                <input type="checkbox" id="skipExternal">
                Лише внутрішні посилання
                <span class="info-tip" tabindex="0" aria-label="Що означає ця опція" data-tip="При ввімкненні перевіряються лише посилання на той самий домен, що й сайт зі sitemap. Зовнішні посилання (на інші домени) ігноруються.">?</span>
              </label>
              <button type="button" id="btnClear" class="btn btn-ghost btn-sm">Очистити</button>
              <button type="button" id="btnClearCache" class="btn btn-ghost btn-sm" title="Очистити кеш поточного сайту" style="display:none">🗑 Кеш сайту</button>
              <button type="button" id="btnClearAllCache" class="btn btn-ghost btn-sm" title="Очистити весь кеш" style="display:none">🗑 Весь кеш</button>
            </div>
            <div id="cacheInfo" style="display:none"></div>
            <div class="option-info" id="internalInfo">
              <strong><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Що означає «Лише внутрішні посилання»?</strong>
              <div>Коли опція <b>увімкнена</b> — сервіс перевіряє лише посилання в межах вашого домену (той самий <code>host</code>, що й у введеному URL). Усі зовнішні лінки — на інші сайти, соцмережі, CDN — пропускаються.</div>
              <ul>
                <li><span style="color:#10b981;font-weight:800">✔ Внутрішнє:</span> <code>https://example.com/about</code>, <code>/contacts</code>, <code>//example.com/blog</code> — <b>перевіряється</b></li>
                <li><span style="color:#94a3b8;font-weight:800">⊘ Зовнішнє:</span> <code>https://facebook.com/...</code>, <code>https://cdn.other.com/lib.js</code> — <b>ігнорується</b></li>
              </ul>
              <div style="margin-top:6px;color:#475569"><b>Коли вмикати:</b> щоб знайти биті 404 саме на своєму сайті і не витрачати час/ліміти на чужі ресурси. <b>Коли вимикати (за замовчуванням):</b> щоб перевірити <u>всі</u> посилання на сторінках — і внутрішні, і зовнішні.</div>
            </div>

            <div class="hint">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <span>Сервіс працює делікатно: 1 запит за раз з паузою <b id="delayHint">350 мс</b>, коректний User-Agent, HEAD → GET fallback. Не перевантажує хостинг. Приклади: <a href="#" data-demo="https://example.com">example.com</a>, <a href="#" data-demo="https://www.wikipedia.org">wikipedia.org</a></span>
            </div>
            <div id="sitemapInfo"></div>
          </form>
        </div>

        <div class="progress-wrap" id="progressWrap">
          <div class="card progress-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap">
              <div class="progress-title" style="font-weight:800;display:flex;align-items:center;gap:8px"><span class="pulse" aria-hidden="true"></span> <span id="stepText">Очікування...</span></div>
              <button type="button" id="btnStop" class="btn btn-danger btn-sm" style="display:none">⏹ Зупинити перевірку</button>
            </div>
            <div class="progress-head">
              <div style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:.04em;text-transform:uppercase">Сканування сторінок (sitemap)</div>
              <div class="progress-pct" id="pctPages">0%</div>
            </div>
            <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px;letter-spacing:.04em;text-transform:uppercase">Сканування сторінок (sitemap)</div>
            <div class="bar"><i id="barPages"></i></div>

            <div class="progress-head" style="margin-top:14px">
              <div style="font-size:12px;font-weight:700;color:#64748b;letter-spacing:.04em;text-transform:uppercase">Перевірка посилань на 404</div>
              <div class="progress-pct" id="pctLinks">0%</div>
            </div>
            <div class="bar"><i id="barLinks"></i></div>

            <div class="status-grid">
              <div class="stat"><div class="n" id="statPages">0</div><div class="l">Сторінок в sitemap</div></div>
              <div class="stat"><div class="n" id="statLinks">0</div><div class="l">Унікальних посилань</div></div>
              <div class="stat"><div class="n" id="statChecked">0</div><div class="l">Перевірено</div></div>
              <div class="stat"><div class="n" id="statBroken">0</div><div class="l">Битих 404</div></div>
            </div>

            <div id="log" class="log"></div>
          </div>
        </div>

        <div class="results card" id="results">
          <div style="padding:18px 18px 0;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <h2 style="margin:0;font-size:18px;letter-spacing:-.02em">Результати</h2>
            <div class="exports">
              <button id="btnExcel" class="btn btn-primary btn-sm" style="background:#107c41;box-shadow:none">⬇ Excel (.xlsx)</button>
              <button id="btnCsv" class="btn btn-ghost btn-sm">CSV</button>
            </div>
          </div>
          <div style="padding:14px 18px 18px">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style="min-width:280px">Бите посилання + анкор</th>
                    <th>Код</th>
                    <th style="min-width:260px">Знайдено на сторінці</th>
                  </tr>
                </thead>
                <tbody id="resultsBody"></tbody>
              </table>
              <div id="emptyOk" class="empty" style="display:none">
                <strong>✅ Битих посилань не знайдено</strong>
                Усі перевірені посилання відповідають (немає 404).
              </div>
              <div id="emptyNone" class="empty" style="display:none">
                <strong>Немає даних</strong>
                Запустіть перевірку.
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside>
        <div class="sitemap-demo">
          <div style="font-weight:900;letter-spacing:-.02em;margin-bottom:6px">Як це працює</div>
          <ol style="margin:0;padding-left:18px;color:#334155;font-size:14px;line-height:1.7">
            <li>Знаходимо <code>sitemap.xml</code> (через <code>robots.txt</code> + стандартні шляхи)</li>
            <li>Підтримуємо <code>sitemap index</code> (вкладені карти)</li>
            <li>По черзі завантажуємо кожну сторінку та збираємо всі <code>&lt;a href&gt;</code></li>
            <li>Кожне унікальне посилання перевіряємо <code>HEAD</code> → <code>GET</code> на код <b>404</b></li>
            <li>Показуємо таблицю: <b>бите посилання → сторінка-джерело</b></li>
          </ol>
          <div class="kpis">
            <div class="kpi"><strong id="kpiLimit">500</strong><span>ліміт сторінок</span></div>
            <div class="kpi"><strong>1</strong><span>потік, пауза 350мс</span></div>
            <div class="kpi"><strong>HEAD</strong><span>швидка перевірка</span></div>
          </div>
          <div style="margin-top:14px;background:#eff6ff;border:1px solid #dbeafe;border-radius:12px;padding:12px;font-size:13px;color:#1e3a8a">
            <b>Анти-блок хостингу:</b> послідовні AJAX-запити, випадковий jitter, реальний User-Agent (Chrome), ліміт налаштовується (500 за замовч.), таймаути 10с, редиректи до 5.
          </div>
        </div>

        <div id="how" class="card" style="margin-top:16px;padding:18px">
          <div style="font-weight:800;margin-bottom:8px">Що перевіряється?</div>
          <ul style="margin:0;padding-left:18px;color:#475569;font-size:14px;line-height:1.7">
            <li>Всі <code>&lt;a href&gt;</code> на сторінках (контент, меню, віджети, футер)</li>
            <li>Внутрішні та зовнішні посилання — керується опцією «Лише внутрішні посилання»</li>
            <li>Ігноруються <code>mailto:</code>, <code>tel:</code>, <code>javascript:</code>, якорі <code>#</code></li>
            <li>Бите = строго <b>HTTP 404</b> (інші 4xx/5xx — інформуються в логах, але не в таблиці)</li>
          </ul>
          <div style="margin-top:14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:12px">
            <div style="font-weight:800;font-size:13px;color:#9a3412;display:flex;align-items:center;gap:6px">⚙️ Опція «Лише внутрішні посилання» — докладно</div>
            <div style="font-size:13px;color:#7c2d12;line-height:1.6;margin-top:6px">
              <b>Вимкнено (за замовчуванням):</b> перевіряються <u>всі</u> знайдені посилання — і ваші, і чужі. Корисно для повного аудиту.<br>
              <b>Увімкнено:</b> перевіряються лише URL з тим самим доменом, що й сайт із поля вводу. Приклад для <code>example.com</code>: <code>/about</code> ✔, <code>https://example.com/blog</code> ✔, а <code>https://google.com</code> або <code>https://facebook.com</code> ✘ пропускаються. Це швидше, менше навантаження на хостинг і фокус лише на власних 404.
            </div>
            <div style="font-size:12px;color:#9a3412;margin-top:6px;background:#fffbeb;border:1px dashed #fcd34d;border-radius:8px;padding:6px 8px">Порівняння <code>host</code> йде строго: <code>sub.example.com</code> ≠ <code>example.com</code> — піддомен вважається зовнішнім.</div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:#64748b">Потрібен повний аудит без sitemap? Зверніться — додамо краулер за лінками.</div>
        </div>

        <div class="card" style="margin-top:16px;padding:16px;display:flex;gap:12px;align-items:center">
          <div style="width:38px;height:38px;border-radius:10px;background:#f1f5f9;display:grid;place-items:center">🛡️</div>
          <div style="font-size:13px;line-height:1.4"><b>Делікатний режим</b><br><span style="color:#64748b">Не використовує паралельні потоки. Хостинг не заблокує.</span></div>
        </div>
      </aside>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div>© <?=date('Y')?> MP Find 404 Links • Зроблено для швидкого аудиту сайтів</div>
      <div>PHP + HTML + CSS + JS • AJAX • sitemap.xml</div>
    </div>
  </div>
</footer>

<script src="assets/js/app.js"></script>
<script>
  // sync hint
  const d=document.getElementById('delay'), h=document.getElementById('delayHint');
  if(d&&h){ d.addEventListener('change',()=> h.textContent = (parseInt(d.value)/1000).toFixed(2)+'с'); }
</script>
</body>
</html>
