<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Disable time limit for long operations
set_time_limit(30);
ini_set('display_errors', 0);
error_reporting(0);

define('CACHE_DIR', __DIR__ . '/cache');
define('CACHE_TTL', 86400 * 7); // 7 днів для кешу сайту
if (!is_dir(CACHE_DIR)) @mkdir(CACHE_DIR, 0775, true);

function cacheKey($host) {
    return preg_replace('/[^a-z0-9\-\.]/i', '_', strtolower($host));
}
function cacheFile($host) {
    return CACHE_DIR . '/site_' . cacheKey($host) . '.json';
}
function cacheGet($host) {
    $file = cacheFile($host);
    if (!is_file($file)) return null;
    $raw = @file_get_contents($file);
    if (!$raw) return null;
    $data = @json_decode($raw, true);
    if (!$data) return null;
    // TTL check
    if (!empty($data['timestamp']) && (time() - $data['timestamp'] > CACHE_TTL)) {
        // expired but keep for reference, mark as stale
        $data['_stale'] = true;
    }
    return $data;
}
function cacheSet($host, $data) {
    $file = cacheFile($host);
    $data['timestamp'] = time();
    $data['host'] = $host;
    @file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT), LOCK_EX);
    return $data;
}
function cacheClear($host) {
    $file = cacheFile($host);
    if (is_file($file)) @unlink($file);
}
function cacheClearAll() {
    $files = @glob(CACHE_DIR . '/site_*.json');
    $n = 0;
    if ($files) foreach ($files as $f) { @unlink($f); $n++; }
    return $n;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) $input = $_POST;
$action = $input['action'] ?? $_GET['action'] ?? '';

function jsonResponse($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalizeUrl($url) {
    $url = trim($url);
    if (!preg_match('#^https?://#i', $url)) {
        $url = 'https://' . $url;
    }
    $url = rtrim($url, '/');
    return $url;
}

function fetchUrl($url, $useHead = false, $timeout = 10) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 MP-Find-404-Bot/1.0',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language: uk,en;q=0.9,ru;q=0.8',
        ],
        CURLOPT_ENCODING => '',
        CURLOPT_NOBODY => $useHead,
        CURLOPT_HEADER => $useHead,
    ]);
    $body = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $error = curl_error($ch);
    curl_close($ch);
    return [
        'code' => $httpCode,
        'body' => $body,
        'content_type' => $contentType,
        'effective_url' => $effectiveUrl,
        'error' => $error
    ];
}

function tryFetchSitemap($sitemapUrl) {
    $res = fetchUrl($sitemapUrl, false, 10);
    if ($res['code'] === 200 && $res['body'] && (stripos($res['body'], '<url') !== false || stripos($res['body'], '<sitemap') !== false)) {
        return $res['body'];
    }
    // also try to detect gzip? but simple
    if ($res['code'] === 200 && strlen($res['body']) > 100) {
        // check if xml
        if (stripos($res['body'], '<?xml') !== false || stripos($res['body'], '<urlset') !== false || stripos($res['body'], '<sitemapindex') !== false) {
            return $res['body'];
        }
    }
    return false;
}

function parseSitemapUrls($xmlContent, &$collected = [], $depth = 0) {
    if ($depth > 3) return; // prevent infinite recursion
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($xmlContent);
    if (!$xml) return;
    $xml->registerXPathNamespace('ns', 'http://www.sitemaps.org/schemas/sitemap/0.9');
    // Try sitemapindex
    $sitemaps = $xml->xpath('//ns:sitemap | //sitemap');
    if (!empty($sitemaps)) {
        foreach ($sitemaps as $s) {
            $loc = (string)($s->loc ?? $s->children()->loc ?? '');
            if (!$loc) {
                // fallback: try xpath
                $locNodes = $s->xpath('ns:loc | loc');
                if (!empty($locNodes)) $loc = (string)$locNodes[0];
            }
            if ($loc) {
                // fetch nested sitemap with throttling delay server-side? No, fetch quickly
                $nested = tryFetchSitemap($loc);
                if ($nested) {
                    parseSitemapUrls($nested, $collected, $depth + 1);
                }
            }
        }
        return;
    }
    // Regular urlset
    $urls = $xml->xpath('//ns:url | //url');
    if (!empty($urls)) {
        foreach ($urls as $u) {
            $loc = (string)($u->loc ?? '');
            if (!$loc) {
                $locNodes = $u->xpath('ns:loc | loc');
                if (!empty($locNodes)) $loc = (string)$locNodes[0];
            }
            if ($loc) $collected[] = trim($loc);
        }
    } else {
        // Fallback simple: search <loc>
        if (isset($xml->url)) {
            foreach ($xml->url as $u) {
                $collected[] = trim((string)$u->loc);
            }
        }
    }
}

function isShareLink($url, $text = '') {
    $urlL = mb_strtolower($url, 'UTF-8');
    $textL = mb_strtolower($text, 'UTF-8');
    // Прямі share-схеми та підрядки viber/whatsapp/tg всередині URL (в т.ч. зламані https://site/viber://...)
    $shareUrlPatterns = [
        '#viber://#i',
        '#whatsapp://#i',
        '#tg://#i',
        '#skype:#i',
        '#fb-messenger://#i',
        '#intent/tweet#i',
        '#twitter\.com/intent#i',
        '#x\.com/intent#i',
        '#facebook\.com/(sharer|share|dialog/share)#i',
        '#fb\.com/sharer#i',
        '#t\.me/share#i',
        '#telegram\.me/share#i',
        '#api\.whatsapp\.com#i',
        '#wa\.me/#i',
        '#pinterest\.(com|ru)/pin/create#i',
        '#linkedin\.com/(shareArticle|sharing)#i',
        '#reddit\.com/submit#i',
    ];
    foreach ($shareUrlPatterns as $pat) {
        if (preg_match($pat, $urlL)) return true;
    }
    // Текст "Поширити через ..." + share-URL — гарантовано шаринг
    // Пропускаємо лише якщо і текст, і URL вказують на шаринг (щоб не відсікати внутрішні сторінки з подібним текстом)
    if (preg_match('#поширити|поділитися|поделиться|share\s*via|share\s*on#iu', $textL)) {
        if (preg_match('#(intent|sharer|share|forward|send|pin/create|submit|viber|whatsapp|tg://|t\.me)#i', $urlL)) return true;
    }
    // Додатково: якщо URL містить одночасно share-домен та параметри url=... — це шаринг
    if (preg_match('#(twitter|x|facebook|linkedin|pinterest|reddit|whatsapp|telegram|viber)\.#i', $urlL) && strpos($urlL, 'url=') !== false) {
        return true;
    }
    return false;
}

function resolveUrl($href, $baseUrl) {
    $href = trim($href);
    if (empty($href) || $href === '#') return null;
    // Пропускаємо не-http схеми: mailto, tel, javascript, data, blob, ftp, viber, whatsapp, tg, skype тощо.
    // Будь-яка схема виду "scheme:" крім http/https — пропускаємо
    if (preg_match('#^[a-z][a-z0-9+\-.]*:#i', $href) && !preg_match('#^https?://#i', $href)) {
        return null;
    }
    if (strpos($href, '#') === 0) return null;

    // Remove fragment
    $href = explode('#', $href)[0];

    if (preg_match('#^https?://#i', $href)) {
        return $href;
    }
    if (substr($href, 0, 2) === '//') {
        $scheme = parse_url($baseUrl, PHP_URL_SCHEME) ?: 'https';
        return $scheme . ':' . $href;
    }
    $parsedBase = parse_url($baseUrl);
    $scheme = $parsedBase['scheme'] ?? 'https';
    $host = $parsedBase['host'] ?? '';
    $basePath = $parsedBase['path'] ?? '/';
    if (substr($href, 0, 1) === '/') {
        return $scheme . '://' . $host . $href;
    }
    // relative path
    $dir = rtrim(dirname($basePath), '/');
    if ($dir === '.' || $dir === '\\') $dir = '';
    return $scheme . '://' . $host . $dir . '/' . $href;
}

function extractLinks($html, $baseUrl, &$skippedShare = 0) {
    $links = [];
    $skippedShare = 0;
    if (empty($html)) return $links;
    libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    // Ensure UTF-8
    $html = mb_convert_encoding($html, 'HTML-ENTITIES', 'UTF-8');
    @$doc->loadHTML($html, LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NOCDATA);
    $xpath = new DOMXPath($doc);
    $nodes = $xpath->query('//a[@href]');
    $baseHost = parse_url($baseUrl, PHP_URL_HOST);
    foreach ($nodes as $node) {
        $href = trim($node->getAttribute('href'));
        $text = trim(preg_replace('/\s+/', ' ', $node->textContent));
        if (mb_strlen($text) > 80) $text = mb_substr($text, 0, 80) . '...';
        $abs = resolveUrl($href, $baseUrl);
        if (!$abs) continue;
        // Validate URL
        if (!filter_var($abs, FILTER_VALIDATE_URL)) continue;
        // Skip anchors, empty, etc
        // Keep http(s) only
        if (!preg_match('#^https?://#i', $abs)) continue;
        // Пропускаємо шаринги "Поширити через ..." — вони дають хибні 404 для бота
        // Причини: viber://, whatsapp://, tg://, twitter.com/intent/tweet тощо повертають 404 при HEAD/GET з сервера,
        // хоча в браузері працюють (потребують кукі/JS/авторизацію або це кастомні схеми)
        if (isShareLink($abs, $text) || isShareLink($href, $text)) {
            $skippedShare++;
            continue;
        }
        // Skip same-page anchor loops? already filtered
        // Deduplicate later
        $links[] = [
            'url' => $abs,
            'text' => $text ?: $abs,
            'raw' => $href
        ];
    }
    return $links;
}

// === ACTIONS ===

// === CACHE ACTIONS ===
if ($action === 'get_cache') {
    $host = trim($input['host'] ?? $input['site_url'] ?? '');
    if (!$host) jsonResponse(['success'=>false,'error'=>'Не вказано host'],400);
    // normalize host
    $p = parse_url(normalizeUrl($host));
    $h = $p['host'] ?? $host;
    $data = cacheGet($h);
    if (!$data) jsonResponse(['success'=>true,'cached'=>false,'host'=>$h]);
    jsonResponse(['success'=>true,'cached'=>true,'data'=>$data]);
}
if ($action === 'save_cache') {
    $host = trim($input['host'] ?? '');
    $cacheData = $input['data'] ?? null;
    if (!$host || !$cacheData) jsonResponse(['success'=>false,'error'=>'Не вказано host або data'],400);
    $p = parse_url(normalizeUrl($host));
    $h = $p['host'] ?? $host;
    cacheSet($h, $cacheData);
    jsonResponse(['success'=>true,'host'=>$h]);
}
if ($action === 'clear_cache') {
    $host = trim($input['host'] ?? $input['site_url'] ?? '');
    if ($host) {
        $p = parse_url(normalizeUrl($host));
        $h = $p['host'] ?? $host;
        cacheClear($h);
        jsonResponse(['success'=>true,'cleared'=>$h]);
    } else {
        jsonResponse(['success'=>false,'error'=>'Не вказано host'],400);
    }
}
if ($action === 'clear_all_cache') {
    $n = cacheClearAll();
    jsonResponse(['success'=>true,'cleared'=>$n]);
}

if ($action === 'parse_sitemap') {
    $siteUrl = trim($input['url'] ?? '');
    if (empty($siteUrl)) jsonResponse(['success' => false, 'error' => 'Вкажіть URL сайту'], 400);
    $siteUrl = normalizeUrl($siteUrl);
    $parsed = parse_url($siteUrl);
    if (empty($parsed['host'])) jsonResponse(['success' => false, 'error' => 'Невірний формат URL'], 400);

    $base = $parsed['scheme'] . '://' . $parsed['host'];
    // also keep port if exists
    if (!empty($parsed['port'])) $base .= ':' . $parsed['port'];

    $candidates = [];
    // Try robots.txt to find sitemap
    $robots = fetchUrl($base . '/robots.txt', false, 8);
    if ($robots['code'] === 200 && $robots['body']) {
        if (preg_match_all('#Sitemap:\s*(\S+)#i', $robots['body'], $m)) {
            foreach ($m[1] as $s) $candidates[] = trim($s);
        }
    }
    // Standard locations
    $candidates[] = $base . '/sitemap.xml';
    $candidates[] = $base . '/sitemap_index.xml';
    $candidates[] = $base . '/sitemap-index.xml';
    $candidates[] = $base . '/wp-sitemap.xml';
    $candidates[] = $base . '/sitemap1.xml';

    $candidates = array_unique($candidates);
    $foundXml = null;
    $usedSitemapUrl = null;
    foreach ($candidates as $cand) {
        $xml = tryFetchSitemap($cand);
        if ($xml) {
            $foundXml = $xml;
            $usedSitemapUrl = $cand;
            break;
        }
    }

    if (!$foundXml) {
        jsonResponse([
            'success' => false,
            'error' => 'Sitemap не знайдено. Перевірте наявність файлу /sitemap.xml на сайті. Спроби: ' . implode(', ', $candidates)
        ], 404);
    }

    $urls = [];
    parseSitemapUrls($foundXml, $urls);
    // If sitemap was index and we parsed nested, ok. If not, try to detect nested even if first was index but parseSitemap already does recursion
    $urls = array_unique(array_filter($urls));
    // Filter only urls from same host? Keep all but prioritize same host
    // Sort
    $urls = array_values($urls);

    // Limit to avoid abuse / hosting block — тепер налаштовується, 500 за замовчуванням
    $totalFound = count($urls);
    $requestedLimit = isset($input['limit']) ? intval($input['limit']) : 500;
    // 0 = без ліміту, інакше clamp 1..20000 для захисту від зловживань
    if ($requestedLimit === 0) {
        $limit = $totalFound; // без ліміту
        $isLimited = false;
    } else {
        $limit = max(1, min(20000, $requestedLimit));
        $isLimited = $totalFound > $limit;
        if ($isLimited) {
            $urls = array_slice($urls, 0, $limit);
        }
    }

    jsonResponse([
        'success' => true,
        'sitemap_url' => $usedSitemapUrl,
        'pages' => $urls,
        'total' => $totalFound,
        'limited' => $totalFound > $limit,
        'limit' => $limit
    ]);
}

if ($action === 'scan_page') {
    $pageUrl = trim($input['page_url'] ?? $input['url'] ?? '');
    if (empty($pageUrl)) jsonResponse(['success' => false, 'error' => 'Не вказано URL сторінки'], 400);
    // Small delay server-side to be polite
    usleep(100000); // 100ms
    $res = fetchUrl($pageUrl, false, 12);
    if ($res['code'] >= 400 || $res['error']) {
        // Try again with GET if HEAD was? Actually we did GET. So return error but still provide info
        jsonResponse([
            'success' => false,
            'error' => 'Не вдалося завантажити сторінку. Код: ' . $res['code'],
            'code' => $res['code']
        ], 200);
    }
    // Check content type is html
    if ($res['content_type'] && stripos($res['content_type'], 'text/html') === false && stripos($res['content_type'], 'application/xhtml') === false) {
        jsonResponse(['success' => true, 'links' => [], 'page_url' => $pageUrl, 'note' => 'Не HTML сторінка (' . $res['content_type'] . ')']);
    }
    $skippedShare = 0;
    $links = extractLinks($res['body'], $pageUrl, $skippedShare);
    // Deduplicate by url
    $uniq = [];
    $seen = [];
    foreach ($links as $l) {
        if (!isset($seen[$l['url']])) {
            $seen[$l['url']] = true;
            $uniq[] = $l;
        }
    }
    jsonResponse([
        'success' => true,
        'page_url' => $pageUrl,
        'links' => $uniq,
        'count' => count($uniq),
        'skipped_share' => $skippedShare
    ]);
}

if ($action === 'check_link') {
    $linkUrl = trim($input['link_url'] ?? $input['url'] ?? '');
    if (empty($linkUrl)) jsonResponse(['success' => false, 'error' => 'Не вказано URL посилання'], 400);
    // Шаринги не перевіряємо — вони дають хибні 404
    if (isShareLink($linkUrl)) {
        jsonResponse([
            'success' => true,
            'url' => $linkUrl,
            'code' => 0,
            'is_broken' => false,
            'is_error' => false,
            'skipped' => true,
            'reason' => 'share link skipped',
            'effective_url' => $linkUrl
        ]);
    }
    // Polite delay
    usleep(rand(150000, 350000)); // 150-350ms

    // First try HEAD
    $res = fetchUrl($linkUrl, true, 10);
    $code = $res['code'];
    // Some servers don't support HEAD correctly (напр. marketplace.visualstudio.com віддає 404 на HEAD і 200 на GET), fallback to GET
    if ($code === 405 || $code === 404 || $code === 403 || $code === 429 || $code === 0 || $code === 500 || $code === 502 || $code === 503) {
        $res2 = fetchUrl($linkUrl, false, 10);
        $code = $res2['code'];
        $res = $res2;
    }
    // Also if HEAD returns 200 but we want to be sure, keep it
    $isBroken = ($code === 404);
    // For reporting, also consider 410 Gone as broken? But spec says only 404. We'll report 404 as broken, other 4xx as "problem" but not counted as 404
    jsonResponse([
        'success' => true,
        'url' => $linkUrl,
        'code' => $code,
        'is_broken' => $isBroken,
        'is_error' => $code >= 400,
        'effective_url' => $res['effective_url'] ?? $linkUrl
    ]);
}

jsonResponse(['success' => false, 'error' => 'Невідома дія: ' . $action], 400);
