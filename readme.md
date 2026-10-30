# MP Find 404 Links — онлайн-сервіс пошуку битих посилань (404)

Сучасний, адаптивний сервіс на **PHP + HTML + CSS + JavaScript** для аудиту сайту на биті посилання. Всі сторінки беруться з `sitemap.xml`, кожне знайдене посилання перевіряється на `404`, результат — таблиця `бите посилання → сторінка-джерело`. Весь процес — через **AJAX без перезавантаження**, з делікатним режимом для хостингу та кешуванням на 7 днів.

---

## 1. Що реалізовано

### 1.1 Базовий функціонал (ТЗ)
- **Форма вводу сайту** → пошук `sitemap.xml` → парсинг усіх `<url><loc>` → послідовне сканування кожної сторінки (контент, віджети, меню, футер) через `DOMDocument //a[@href]`.
- **Перевірка 404**: для кожного унікального `<a href>` виконується `HEAD` → fallback `GET` на `404/405/403/429/0/500/502/503` (верифікація `HEAD 404` через `GET` — фікс для `marketplace.visualstudio.com`, див. п. 1.3 h), код `404` = бите. Інші `4xx/5xx` — у логах, але не в таблиці (строго за ТЗ).
- **Вивід поруч із джерелом**: таблиця з колонками `Бите посилання + анкор | Код 404 | Знайдено на сторінці` (кілька джерел через `<br>`).
- **AJAX**: `fetch('api.php')` з `POST JSON` (`parse_sitemap`, `scan_page`, `check_link`), прогрес-бари, лічильники, лог.
- **Анти-блок хостингу**: 1 запит за раз, пауза `200ms–1s` (за замовчуванням `350ms` + `0–120ms jitter`), `User-Agent: Chrome 124`, `HEAD→GET` (fallback на `404/405/403/429/500/502/503` — див. п. 1.3 h), `follow 5 редиректів`, `timeout 10–12s`, ліміт налаштовується (за замовчуванням `500`, до `20000` або без ліміту — `api.php:379` + селект `#pageLimit` у `index.php:71`), `usleep` на сервері.

### 1.2 Дизайн
- Світла тема (`--bg:#f8fafc`, `--primary:#2563eb`), `Inter`, `backdrop-filter`, картки з `shadow`, `radius:16px`, адаптив `1120px` контейнер, `flex/grid`.
- `hero-grid` — **на всю ширину**: перший `<div>` (заголовок, форма, прогрес, результати) `width:100%`, `<aside>` — також `width:100%` **під** контентом, а не збоку (`assets/css/style.css:50` — `display:flex; flex-direction:column`).

### 1.3 Додаткові фічі

#### a) Кешування для кожного сайту
- **Де**: `localStorage` (`mp404_cache_<host>`) + сервер `cache/site_<host>.json` (дублювання для кросс-браузерності).
- **TTL**: 7 днів (`CACHE_TTL` у `api.php:18`), позначається `_stale`.
- **Що зберігається**: `host, siteUrl, sitemapUrl, pages[], scannedPages[], linksMap[] (url,text,sources[]), checkedMap{url->{code,is_broken}}, broken[] (з sources), failedPages[] ({url,error,code,attempts,lastAt}), skipExternal, timestamp`.
- **Логіка «лише нові сторінки»**: при повторному запуску того самого `host` + того самого `sitemapUrl` + того самого режиму `skipExternal` — відновлюються `scannedPages`/`linksMap`/`checkedMap`/`broken`/`failedPages`, обчислюється `newPages = pages.filter(p => !scannedPagesSet.has(p) && !failedPermanentSet.has(p))`, скануються лише `newPages`, перевіряються лише `toCheck = allLinks.filter(l=>!checkedMap.has(l.url))`. Якщо `newPages==0` — фаза 1 пропускається.
- **Автозбереження**: після кожної успішної сторінки та кожних `5` перевірок посилань викликається `saveCache()` (локально + `POST save_cache` на сервер).
- **Переривання**: при `Зупинити`, закритті вкладки або втраті інтернету — кеш вже збережено, наступний запуск довантажить лише нові сторінки.

#### b) Кнопки очищення кешу
- **🗑 Кеш сайту** (`#btnClearCache` `index.php:87`) — видима лише якщо для введеного `host` є кеш; `confirm` → `localStorage.removeItem` + `POST clear_cache`.
- **🗑 Весь кеш** (`#btnClearAllCache`) — видима якщо є хоч один `mp404_cache_*`; `confirm` → `clearAllCaches()` + `POST clear_all_cache`.
- Інфо-бейдж `#cacheInfo` `assets/js/app.js:117` показує `Знайдено кеш: <host> • збережено <дата> • перевірено X/Y • ... • Нових: N`.

#### c) Експорт
- **CSV** (`toCsv()` `assets/js/app.js:239`): `broken_url,http_code,anchor_text,source_pages` з BOM, лапки екрануються в усіх полях.
- **Excel (.xlsx)** (`exportExcel()` `assets/js/app.js:263` через `xlsx-js-style` CDN — форк SheetJS з підтримкою стилів, бо чистий SheetJS CE мовчки ігнорує `.s`, див. п. 1.3 j): 3 аркуші:
  1. **404 Links** — заголовок синій `#2563EB` (білий жирний, по центру, висота рядка `32pt` — дво- і трирядкові назви повністю видимі), биті URL — клікабельні гіперлінки (червоні, підкреслені), код `404` — жирний червоний по центру, `autofilter`, `wrapText` (джерела через `\n` — багаторядкові), ширини `60/32`; висота кожного рядка рахується автоматично (`rowHpt()` `assets/js/app.js:248` — за найвищою з колонок URL/анкор/джерела: `рядки × 15pt`, min `18`, max `409`), весь вміст завжди видимий; якщо битих `0` — placeholder.
  2. **Зведення** — сайт, host, sitemap, дата, `сторінок/перевірено/не завантажено/посилань/битих`, `кеш використано`, затримка, режим, примітки; заголовок змерджовано (`!merges`), назви полів жирні, URL клікабельні, висоти рядків — теж авто (`rowHpt()` за колонкою значень).
  3. **Не завантажені** — **список сторінок, які не вдалося завантажити, з причиною**: колонки `№ | URL сторінки | Причина/помилка | HTTP код | Спроби | Остання спроба`, червоні хедери `#B91C1C` (`32pt`), URL клікабельні, `wrapText`, автоширина-висота за колонками URL/причина. Дані беруться з `state.failedPages[]` (після 3 спроб). Файл `404-links-<host>-YYYY-MM-DD.xlsx` (запис з `{cellStyles:true}`). Фолбек — стилізований HTML `.xls` (сині шапки, `colgroup` ширини, клікабельні лінки, freeze через `mso`, рядок-заглушка при 0 битих, коректне екранування `&<>"`).
  - NB: freeze panes (`!freeze`) writer бібліотеки не пише (sheetViews хардкод) — тому покладаємось на `autofilter`, закріплення шапки в Excel доведеться вмикати вручну (View → Freeze Top Row).
  - Приклад готового звіту: `cache/example-404-links-report.xlsx` (згенерований цим самим кодом, 6 битих + 2 незавантажені).

#### d) Черга повторів для неперевірених сторінок
- Якщо `scan_page` повернув `success:false` або мережева помилка — сторінка додається в `retryQueue` з `attempts++`, `error`, `code`, `lastAt`.
- Після першого проходу — пауза `1.2s` і до `2` додаткових раундів по `retryQueue` (`processQueue()` `assets/js/app.js:600`). Після `3` спроб — переноситься в `failedPages` з причиною, надалі **пропускається**, але **включається в Excel «Не завантажені»** і не блокує аудит. Прогрес-бар при retry `capped 92%` → `100%`.

#### e) Кнопка «Зупинити перевірку»
- `#btnStop` `index.php:113` — `.btn-danger`, видима лише під час `running`, `AbortController` abortить `fetch`, `state.stopped=true`, лог `Зупиняємо...`, `saveCache()` перед виходом, статус `Зупинено (кеш збережено)`, часткові результати доступні для експорту.

#### f) «Тільки внутрішні посилання»
- **Біля опції**: чекбокс `.control.has-info` + `?` `.info-tip` з `data-tip` тултіпом (`assets/css/style.css:104`), постійний блок `.option-info` `#internalInfo` `index.php:91` з `✔ Внутрішнє: https://example.com/about, /contacts` vs `⊘ Зовнішнє: https://facebook.com`, та коли вмикати/вимикати.
- **В бічному блоці `#how`** `index.php:192` — виділений помаранчевий блок `⚙️ Опція — докладно` з прикладами для `example.com` і приміткою `sub.example.com ≠ example.com`.

#### g) Фільтрація «Поширити через...» (share-лінки) — чому 3 URL вважалися 404 і як виправлено
- **Приклади хибних 404**:
  - `https://twitter.com/intent/tweet?url=https%3A%2F%2Fthepetrov.com%2Ffind-orphan-pages%2F&text=...`
  - `https://thepetrov.com/viber://forward?text=https%3A%2F%2Fthepetrov.com%2Ffind-orphan-pages%2F` (зламаний `https://site/viber://...`)
  - `https://twitter.com/intent/tweet?url=https%3A%2F%2Fthepetrov.com%2Fuseful-online-resources...`
- **Чому бот бачив 404, хоча в браузері лінк коректний**:
  1. **Twitter/X `intent/tweet`** — ендпоінт повертає `404` при `HEAD` і навіть `GET` з сервера (`curl` з `MP-Find-404-Bot` UA отримує `403/404` з титулом `X / ?` та `fullscreen_errors.css`). Це захист від ботів: без cookie/JS/авторизації та `Sec-Fetch` шаринг-інтент недоступний для серверного `cURL`, але відкривається в браузері користувача в попапі. Перевірка `HEAD 404 → вважати битим` давала хибний позитив. Фікс `HEAD 404` через `GET` не допомагає — `GET` теж `404`.
  2. **`viber://forward`** — кастомна схема `viber://` не є `http(s)`. Старий `resolveUrl()` перевіряв лише `mailto|tel|javascript|data|blob|ftp`, тому `viber://` не відсікався і при `href="viber://forward?text=..."` на сторінці `https://thepetrov.com/find-orphan-pages/` перетворювався на `https://thepetrov.com/viber://forward?text=...` — такого URL на сайті немає → `404` (технічно це зламаний URL, але шаринг-лінк не повинен перевірятися взагалі).
- **Рішення (пропускаємо шаринги)** — за вимогою «якщо немає коректного виправлення — пропускай `Поширити`»:
  - `resolveUrl()` `api.php:212` тепер відсікає **будь-яку схему `^[a-z][a-z0-9+.-]*:` крім `http/https`** (`viber:, whatsapp:, tg:, skype:` тощо → `null`).
  - Нова функція `isShareLink($url,$text)` `api.php:174` — патерни: `viber://, whatsapp://, tg://, skype:, fb-messenger://, twitter.com/intent, x.com/intent, facebook.com/sharer|dialog/share, t.me/share, api.whatsapp.com, wa.me/, pinterest.com/pin/create, linkedin.com/shareArticle, reddit.com/submit`, а також `поширити|поділитися|поделиться|share via|share on` в анкорі + `intent|sharer|share|forward` в URL.
  - `extractLinks()` `api.php:245` викликає `isShareLink($abs,$text) || isShareLink($href,$text)` — шаринги інкрементують `$skippedShare` і **не додаються** в `links[]`. `scan_page` повертає `skipped_share` для логу (`assets/js/app.js:615` → `пропущено шарингів: N`).
  - `check_link` `api.php:444` ранній `if(isShareLink($linkUrl)) return {skipped:true, is_broken:false, code:0}` + JS `assets/js/app.js:747` логує `⊘ Пропущено шаринг`.
  - Результат: шаринги не потрапляють у таблицю битих і не псують Excel/CSV.

#### h) Помилкові 404 на `marketplace.visualstudio.com` — `HEAD` не підтримується (фікс `api.php:463`)

- **Кейс**: сторінка `https://thepetrov.com/visual-studio-code-settings-extensions-hotkeys/` містить 17 зовнішніх лінків виду `https://marketplace.visualstudio.com/items?itemName=formulahendry.auto-rename-tag` (та `pranaygp.vscode-css-peek`, `diz.ecsstractor-port`, `lior-chamla.google-fonts` … `johnbillion.vscode-wordpress-hooks`). У браузері всі відкриваються (`GET 200`), але сервіс позначав їх як биті (`404`). Для всіх інших посилань на сайті помилок не знайдено.
- **Причина**: `marketplace.visualstudio.com` не реалізує `HEAD` для `GalleryController.Details` — `HEAD` завжди віддає `404 Not Found` з заголовками `X-TFS-ServiceError: A public action method 'Details' was not found on controller 'GalleryController'`, `X-TFS-ProcessId`, `X-VSS-*`, тілом `~130KB html`, тоді як `GET` з тим же `User-Agent` віддає `200 text/html`. Стара логіка `api.php:463` `if ($code===405||$code===403||$code===0||$code===500)` не робила fallback на `404`, тому `HEAD 404` одразу вважався `is_broken=true`. Перевірка `curl -I -L -A "MP-Find-404-Bot/1.0"` vs `curl -L` підтвердила `HEAD=404 GET=200` на всіх 17 URL.
- **Рішення** (`api.php:460-467`): розширено fallback — `if ($code===405||$code===404||$code===403||$code===429||$code===0||$code===500||$code===502||$code===503) { $res=fetchUrl(GET) }`. Тепер `HEAD 404` верифікується через `GET`:
  - валідне розширення → `HEAD 404` → `GET 200` → `is_broken=false` (хибний позитив зник);
  - справді бите `...?itemName=nonexistent.fake-123456` → `HEAD 404` → `GET 404` → `is_broken=true`.
- **Ефект**: для інших доменів (`thepetrov.com` → `HEAD 200`) поведінка не змінилась, тому інших помилок і не було. Після фіксу потрібно очистити кеш `🗑 Кеш сайту` і перезапустити перевірку — 17 marketplace-лінків зникнуть зі звіту.

#### i) Ліміт 500 сторінок — чому та що якщо на сайті більше
- **Чому 500 за замовчуванням**: захист від блокування хостингу та перевантаження. `500` сторінок × `500` витягів `scan_page` + `~кілька сотень` перевірок `check_link` з паузою `350мс` ≈ `3–6 хв` на фазу збору + `5–15 хв` на перевірку, помірне навантаження на CPU/RAM (`DOMDocument`), ліміт `max_execution 30s` на один `curl`, але сумарно AJAX триває довго — більші обсяги ризикують `timeout` браузера/хостингу, `memory_limit` та `DoS`-аб'юзом (хтось сканує чужі великі сайти через ваш сервер). Тому `api.php:379` мав хардкод `array_slice 500`.
- **Що якщо сторінок >500**: старий код обрізав `pages = array_slice(0,500)` — сторінки `501…N` **ніколи** не перевірялися, кеш не допомагав (бо їх не було в кеші). Тепер **налаштовується**:
  - Селект `Ліміт сторінок` `index.php:71` — `500 / 1000 / 2000 / 5000 / 10000 / Без ліміту`, `info-tip` пояснює `500≈3 хв`.
  - `assets/js/app.js:526` передає `limit` у `POST parse_sitemap {url, limit}`, `api.php:379` — `requestedLimit 0=без ліміту`, інакше `clamp(1..20000)` (захист від `999999`).
  - `kpi` `index.php:183` оновлюється динамічно (`#kpiLimit` `∞` для без ліміту).
  - Рекомендації: для `>2000` ставте `600–1000мс` затримку та використовуйте кеш — повторний запуск перевірить лише `newPages` (різниця `sitemap`), тому великий сайт можна прогнати частинами (`500` → кеш → ще `500` нових → знову). Без ліміту — лише для невеликих VPS/локально, стежте за `timeout` і логами `Не завантажені` (Excel аркуш 3).

#### j) Аудит та ремонт Excel-звіту — чому «красивий код» давав плоский файл
- **Проблема 1 — стилі ігнорувались.** Код задавав `cell.s = {font, fill, alignment}` (синя шапка, червоні URL, `wrapText`), але CDN-бібліотека SheetJS CE `0.18.5` мовчки відкидає стилі при записі (це Pro-фіча): стиль є в пам'яті, а після `writeFile → readFile` клітинки вже без `s`, `styles.xml` — порожній. Доведено згенерованим тестом. **Рішення:** CDN замінено на `xlsx-js-style@1.2.0` (`index.php`, drop-in форк з робочими стилями, той самий глобальний `XLSX`), запис з `{cellStyles:true}`, заливки — з обов'язковим `patternType:"solid"` (без нього ігнор навіть тут). Перевірено розбором `xl/styles.xml`: шрифти, `FF2563EB`, `wrapText` на місці.
- **Проблема 2 — URL не клікабельні.** Жодна клітинка не мала гіперпосилання — всі адреси були звичайним текстом. **Рішення:** `cell.l = {Target: url}` для битих URL, URL у «Зведенні» та сторінок у «Не завантажених»; перевірено `<hyperlinks>` у XML аркушів.
- **Проблема 3 — `!freeze` не пишеться.** Writer бібліотеки хардкодить `<sheetViews><sheetView workbookViewId="0"/></sheetViews>` без `<pane>` — закріплення шапки ігнорується і об'єктом `{xSplit,ySplit}`, і рядком `'A2'` (перевірено обома). **Рішення:** мертвий код прибрано (з коментарем `NB`), лишено робочий `autofilter` (`<autoFilter ref=.../>` підтверджено в XML); freeze шапки — вручну в Excel (View → Freeze Top Row).
- **Проблема 4 — шапка обрізалась.** Висота рядка заголовків `22pt` вистачає лише на 1 рядок тексту 11pt, а «К-сть джерел» переноситься на 2 — текст було погано видно. **Рішення:** висота шапок `32pt` + центрування (аркуші `404 Links` і `Не завантажені`).
- **Проблема 5 — фіксовані висоти рядків даних** (`36`/`28`) обрізали довгі URL/джерела або давали зайву порожнечу. **Рішення:** `rowHpt()` (`assets/js/app.js:248`) — автовисота кожного рядка за найвищою з його «великих» колонок (URL/анкор/джерела; URL/причина; значення у «Зведенні»): враховуються явні `\n` та автоматичні переноси (`довжина / ширина`, із запасом `0.85` під пропорційний шрифт і кирилицю — краще рядок трохи вищий, ніж обрізаний текст), формула `рядки × 15pt`, min `18`, max `409` (ліміт Excel). Застосовано до всіх 3 аркушів.
- **Проблема 6 — CSV:** лапки екранувались не в усіх полях (URL з `"` ламав розбір). **Рішення:** `esc()` для всіх колонок у `toCsv()`.
- **Фолбек `.xls`** (коли CDN недоступний) переписано: повноцінний стилізований звіт — сині шапки, `colgroup` ширини, клікабельні лінки, freeze через `mso`, рядок-заглушка при 0 битих, коректне `escHtml` (`&<>"`).
- **Приклад:** `cache/example-404-links-report.xlsx` — згенерований цим самим кодом (6 битих + 2 незавантажені), для візуальної перевірки; висоти рядків і стилі верифіковано розбором XML.

---

## 2. Архітектура

```
/
├── index.php          # UI, форма, hero-grid (flex-column), підключення style.css + xlsx-js-style CDN + app.js
├── api.php            # JSON API: parse_sitemap, scan_page, check_link, get_cache, save_cache, clear_cache, clear_all_cache
├── assets/css/style.css # Дизайн-система, hero-grid, info-tip, cache-alert
├── assets/js/app.js   # AJAX, черги, кеш (localStorage+server), Excel (exportExcel, toCsv, rowHpt), стоп, ретраї
├── cache/             # file cache site_<host>.json (створюється автоматично, 0775) + example-404-links-report.xlsx (приклад звіту)
├── readme.md
└── robots.txt         # Allow: / , Disallow: /api.php
```

### API

| action | in | out |
|---|---|---|
| `parse_sitemap` | `{url, limit?}` | `{success, sitemap_url, pages[], total, limited, limit}` — шукає в `robots.txt` + 5 кандидатів, `sitemap_index` до глибини 3, `limit` налаштовується (`500` за замовч., `0`=без ліміту, `clamp 20000` `api.php:379`) |
| `scan_page` | `{page_url}` | `{success, links:[{url,text,raw}], count, skipped_share, code, error}` — `DOMDocument`, `resolveUrl()` (відсікає `viber://` тощо), `isShareLink()` фільтр, дедуп |
| `check_link` | `{link_url}` | `{code,is_broken,is_error,skipped,reason,effective_url}` — `HEAD` → `GET` fallback на `404/405/403/429/0/500/502/503` (верифікація `HEAD 404` через `GET` для `marketplace.visualstudio.com` та ін. — `api.php:463`), ранній `skipped` для шарингів |
| `get_cache` | `{host}` | `{cached, data}` |
| `save_cache` | `{host,data}` | `{success}` |
| `clear_cache` | `{host}` | `{cleared}` |
| `clear_all_cache` | `{}` | `{cleared:N}` |

Всі запити `POST JSON`, `CORS *`, `OPTIONS 200`.

---

## 3. Встановлення та запуск

1. Вимоги: `PHP >=7.4` з `curl, dom, libxml, json`, права на запис `cache/`.
2. Скопіюйте проєкт у `htdocs / www` (Laragon, OpenServer, `php -S`).
3. Переконайтесь що `cache/` доступна для запису (`chmod 775`).
4. Відкрийте `https://your-domain/` або `php -S 127.0.0.1:8000 -t .` → введіть `https://example.com` → `Перевірити`.

---

## 4. Використання

1. Введіть домен (з або без `https://`), оберіть затримку (`0.35с` рекомендовано) та режим «Тільки внутрішні».
2. Якщо для домену є кеш — побачите `📦 Знайдено кеш... Нових: N`. Натисніть `Перевірити` — буде перевірено лише нові сторінки/посилання.
3. Спостерігайте прогрес (2 бари, лічильники, лог), за потреби `⏹ Зупинити` — кеш збережеться.
4. Після завершення — таблиця битих + `⬇ Excel (.xlsx)` (3 аркуші, автоширина/автовисота, клікабельні лінки) / `CSV`. Аркуш «Не завантажені» містить `URL | Причина | Код | Спроби` для сторінок після 3 невдач. Готовий вигляд звіту — `cache/example-404-links-report.xlsx`.
5. Для повного перескану — `🗑 Кеш сайту` або `🗑 Весь кеш`.

---

## 5. Безпека та обмеження

- `cURL` з `SSL_VERIFYPEER=false` для сумісності, `timeout 10–12s`, `maxredirs 5`, валідація URL через `filter_var`, `HEAD→GET` fallback на `404/405/403/429/0/500/502/503` (`api.php:463` — верифікація `HEAD 404` через `GET` для `marketplace.visualstudio.com`).
- `strip fragment`, `skip mailto/tel/javascript/data/viber/whatsapp/tg/skype` (будь-яка не-http схема), `isShareLink()` фільтр `twitter.com/intent, x.com/intent, facebook sharer, t.me/share, wa.me, pinterest pin/create` + `поширити|поділитися|share via` в анкорі, `filter http(s) only`.
- Ліміт сторінок **налаштовується** `index.php:71` (`500` за замовч. — делікатно для хостингу, `1000/2000/5000/10000/без ліміту` до `20000` на сервері `api.php:379`), глибина `sitemap_index` `3`, `libxml` помилки приглушені.
- Кеш — 7 днів, не містить чутливих даних, зберігається локально та в `cache/` на сервері.

---

## 6. Подальший розвиток

- Краулер без `sitemap.xml` (BFS по внутрішніх лінках).
- Паралельні запити з семафором (зараз `1` потік).
- Перевірка зображень/ресурсів, `410/5xx` окремо.

© 2025 MP Find 404 Links — PHP + HTML + CSS + JS, AJAX, sitemap.xml
