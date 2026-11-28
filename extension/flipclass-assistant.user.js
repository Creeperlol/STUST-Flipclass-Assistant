// ==UserScript==
// @name         STUST Flipclass Assistant
// @namespace    https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @version      2.1.0
// @description  FlipClass assignment overview: submitted / to do / overdue across all courses (follows the site language)
// @author       Creeperlol
// @license      CC-BY-NC-SA-4.0
// @match        https://flipclass.stust.edu.tw/*
// @match        https://webap.stust.edu.tw/courinfo/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @updateURL    https://raw.githubusercontent.com/Creeperlol/STUST-Flipclass-Assistant/main/extension/flipclass-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/Creeperlol/STUST-Flipclass-Assistant/main/extension/flipclass-assistant.user.js
// ==/UserScript==

// 這個檔案同時是 Tampermonkey 使用者腳本，也是瀏覽器擴充功能的 content script。
(function () {
  'use strict';
  if (window.__fcaLoaded) return;
  window.__fcaLoaded = true;

  // ---------- 學校的課程大綱頁 ----------
  // FlipClass 的「我的課表」不知道上課時間，但課程資訊裡嵌的課程大綱（webap.stust.edu.tw）有。
  // 這裡只做一件事：被 FlipClass 用 iframe 打開時，把「上課教室(時間)」傳回去，其他什麼都不動。
  if (location.hostname === 'webap.stust.edu.tw') {
    const send = () => {
      if (window.parent === window) return;
      const txt = (document.body && document.body.textContent) || '';
      const part = (txt.split(/上課教室\s*[(（]\s*時間\s*[)）]/)[1] || '').split(/課程時數/)[0];
      const DAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
      const slots = [];
      for (const m of part.matchAll(/週\s*([一二三四五六日天])\s*第\s*(\d+)\s*節\s*(?:[(（]([^)）]*)[)）])?/g)) {
        slots.push({ day: DAY[m[1]], p: +m[2], room: (m[3] || '').trim().slice(0, 40) });
      }
      const code = new URLSearchParams(location.search).get('subcode');
      window.parent.postMessage({ fcaTimetable: 1, code, slots }, 'https://flipclass.stust.edu.tw');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', send); else send();
    return;
  }

  // ---------- 夜間模式 ----------
  // 不用整頁反轉：讀取網站自己的 CSS，把淺色背景換成深灰、深色文字換成淺色，
  // 圖片保持原樣。document-start 先鋪深色底，DOM 好了再產生完整的配色。
  const DARK_KEY = 'fca-dark';
  const NAV = ':is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar)';
  const D = 'html[data-fca-dark]';
  const darkBase = document.createElement('style');
  darkBase.id = 'fca-dark-base';
  // 配色照 GitHub 深色主題：頁面 #0d1117、上方列 #010409、框線 #30363d、
  // 次要底色 #151b23、文字 #f0f6fc / #9198a1、連結 #4493f8
  darkBase.textContent = `
${D}{color-scheme:dark;background:#0d1117!important}
${D} body{background:#0d1117!important;color:#f0f6fc}
${D}:not([data-fca-ready]) body{visibility:hidden}
${D} :is(input,textarea,select){background-color:#0d1117;color:#f0f6fc;border-color:#3d444d}
${D} :is(input,textarea,select):focus{border-color:#1f6feb}
${D} :is(img:not(.fs-logo):not(.fs-user-info-photo),.img-container,.fs-banner){filter:brightness(.88)}
${D} .fs-banner{border-color:#30363d!important}
${D} ${NAV}{background:#010409!important;border-color:#30363d!important;border-width:0 0 1px!important;border-style:solid!important;
  box-shadow:none!important;background-image:none!important}
${D} ${NAV} :is(.navbar-brand,.navbar-nav>li>a,.navbar-toggle){color:#f0f6fc!important;background:transparent!important}
${D} ${NAV} :is(.navbar-brand,.navbar-nav>li>a,.navbar-toggle):is(:hover,:focus),
${D} ${NAV} .navbar-nav>.open>a{background:#151b23!important;color:#f0f6fc!important;outline:none}
${D} ${NAV} .dropdown-menu{background:#151b23!important;border:1px solid #3d444d!important;box-shadow:0 8px 24px rgba(1,4,9,.75)!important}
${D} ${NAV} .dropdown-menu>li>a{color:#f0f6fc!important}
${D} ${NAV} .dropdown-menu>li>a:is(:hover,:focus){background:#212830!important;color:#f0f6fc!important}
${D} ${NAV} .divider{background:#3d444d!important}
${D} ${NAV} :is(.navbar-collapse,.navbar-form){border-color:#30363d!important}
${D} .fca-about a{color:#9198a1!important}
${D} .fca-about a:hover{color:#4493f8!important}
.fca-theme:focus{outline:none}
.fca-about{position:absolute;right:16px;top:0;list-style:none}
.fca-about a{display:block;padding:11px 0 10px;font-size:11px;line-height:14px;text-align:right;font-weight:400;opacity:.8;
  color:inherit;text-decoration:none}
.fca-about a:hover{opacity:1;text-decoration:none}
@media (max-width:1599px){.fca-about{display:none!important}}
.fca-about-li>a{font-size:11px!important;opacity:.7}
.fca-about-li>a:hover{opacity:1}
nav.fca-tight li.fca-nav>a{padding-left:7px!important;padding-right:7px!important}
@media (min-width:1600px){.fca-about-li{display:none!important}}
.fca-hw{display:inline-flex;align-items:center;gap:8px;margin-left:12px;font-size:13px;font-weight:600;vertical-align:middle}
.fca-hw .t{padding:1px 8px;border:1px solid currentColor;font-size:12px;font-weight:700}
.fca-todo{color:#9a6700}.fca-missed{color:#cf222e}.fca-done{color:#1a7f37}.fca-sub{color:#59636e;font-weight:500}
${D} .fca-todo{color:#d29922!important}${D} .fca-missed{color:#f85149!important}${D} .fca-done{color:#3fb950!important}${D} .fca-sub{color:#9198a1!important}
:root tr.fca-row-todo>td{background:rgba(212,167,44,.13)!important}
:root tr.fca-row-missed>td{background:rgba(207,34,46,.09)!important}
:root tr.fca-row-todo>td:first-child{box-shadow:inset 3px 0 #d4a72c}
:root tr.fca-row-missed>td:first-child{box-shadow:inset 3px 0 #cf222e}
${D} tr.fca-row-todo>td{background:rgba(210,153,34,.14)!important}
${D} tr.fca-row-missed>td{background:rgba(248,81,73,.11)!important}
.fca-tt{text-align:left;font-size:12px;line-height:1.35;padding:4px 6px;margin:2px 0;background:rgba(212,167,44,.14);border-left:3px solid #d4a72c}
.fca-tt a{font-weight:600}
.fca-tt small{display:block;opacity:.75;font-size:11px}
.fca-tt-note{margin-left:12px;font-size:12px;opacity:.8}
.fca-nav-urgent{display:inline-block;min-width:16px;padding:0 4px;margin-left:4px;border-radius:8px;background:#f85149;color:#fff;
  font-size:11px;line-height:16px;text-align:center;font-weight:700;vertical-align:1px}`;
  (document.head || document.documentElement).appendChild(darkBase);

  // 顏色換算（HSL）
  let colorCtx = null;
  const colorMemo = new Map();
  function parseColor(v) {
    v = (v || '').trim();
    if (colorMemo.has(v)) return colorMemo.get(v);
    const c = parseColorRaw(v);
    colorMemo.set(v, c);
    return c;
  }
  function parseColorRaw(v) {
    if (!v || /^(inherit|initial|unset|revert|currentcolor|transparent|none)$/i.test(v) || v.includes('var(')) return null;
    colorCtx = colorCtx || document.createElement('canvas').getContext('2d');
    colorCtx.fillStyle = '#010203';
    colorCtx.fillStyle = v;
    const o = colorCtx.fillStyle;
    if (o === '#010203' && !/^#010203$/i.test(v)) return null;
    if (o[0] === '#') return [parseInt(o.slice(1, 3), 16), parseInt(o.slice(3, 5), 16), parseInt(o.slice(5, 7), 16), 1];
    const m = o.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  const hsla = (h, s, l, a) => `hsla(${h.toFixed(0)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;
  // 沒什麼彩度的顏色一律用 GitHub 的藍灰色調（色相 215）
  const neutral = (h, s) => (s < 0.15 ? [215, 0.2] : [h, Math.min(s, 0.45)]);
  function mapBg(c) { // 淺色背景 → #0d1117 / #151b23 / #212830；本來就深的（按鈕）不動
    const [h0, s0, l] = toHsl(c);
    if (l < 0.55) return null;
    const [h, s] = neutral(h0, s0);
    return hsla(h, s0 < 0.15 ? s : s * 0.5, Math.min(0.07 + (1 - l) * 1.1, 0.2), c[3]);
  }
  function mapFg(c) { // 深色文字 → #f0f6fc（主要）/ #9198a1（次要）；彩色文字（連結）→ 像 #4493f8
    const [h, s, l] = toHsl(c);
    if (l > 0.62) return null;
    if (s > 0.3) return hsla(h, Math.min(s * 1.4, 0.9), Math.max(0.58, Math.min(0.72, 0.62 + (0.45 - l) * 0.3)), c[3]);
    const nl = l < 0.3 ? 0.96 - l * 0.4 : 0.6;
    // 只留一點點藍灰色調，避免文字看起來偏藍
    return hsla(215, l < 0.3 ? 0.12 : 0.06, nl, c[3]);
  }
  function mapBorder(c) { // 淺色框線 → #30363d
    const [h0, s0, l] = toHsl(c);
    if (l < 0.5) return null;
    const [h, s] = s0 < 0.15 ? [213, 0.12] : [h0, s0 * 0.4];
    return hsla(h, s, Math.min(0.21 + (1 - l) * 0.2, 0.27), c[3]);
  }
  const MAPS = [
    ['background-color', mapBg], ['color', mapFg],
    ['border-top-color', mapBorder], ['border-right-color', mapBorder],
    ['border-bottom-color', mapBorder], ['border-left-color', mapBorder],
  ];
  // 網站的 a:hover 有好幾種藍（#23527c、#000099…），換算後會偏亮或偏紫；
  // 藍色系一律用跟一般連結相同的藍，其他顏色保持色相
  function hoverColor(c) {
    const [h, s] = toHsl(c);
    return h >= 190 && h <= 260 ? hsla(210, 0.78, 0.617, c[3]) : hsla(h, Math.min(s * 1.4, 0.9), 0.617, c[3]);
  }
  // 回傳 [屬性, 深色值, 是否 important] 清單
  function darkPairs(style, hover, sel = '') {
    const out = [];
    for (const [prop, fn] of MAPS) {
      const c = parseColor(style.getPropertyValue(prop));
      if (!c) continue;
      // 連結滑過（:hover）時跟 GitHub 一樣：顏色不變（網站原本會換深藍，換算後反而變亮），只靠底線
      const link = hover && prop === 'color' && toHsl(c)[1] > 0.3;
      const v = link ? hoverColor(c) : fn(c);
      if (!v) continue;
      if (link && /(^|[\s>+~,(])a[:.\[]/.test(sel)) out.push(['text-decoration', 'underline', false]);
      out.push([prop, v, !!style.getPropertyPriority(prop)]);
    }
    // 淺色漸層背景直接換成單色
    const bi = style.getPropertyValue('background-image');
    if (bi && bi.includes('gradient')) {
      const cols = (bi.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|\b[a-z]+\b(?=\s*[,)\s]))/gi) || []).map(parseColor).filter(Boolean);
      if (cols.length && cols.every(c => toHsl(c)[2] >= 0.55)) {
        out.push(['background-image', 'none', true], ['background-color', mapBg(cols[0]), true]);
      }
    }
    return out;
  }
  const darkDecl = (style, hover, sel) =>
    darkPairs(style, hover, sel).map(([p, v, imp]) => `${p}:${v}${imp ? '!important' : ''};`).join('');
  function splitSelectors(sel) {
    const out = []; let depth = 0, cur = '';
    for (const ch of sel) {
      if (ch === '(') depth++; else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim()).filter(Boolean).map(s =>
      /^(html|:root)\b/.test(s) ? s.replace(/^(html|:root)/, D) : `${D} ${s}`).join(',');
  }
  function walkRules(rules) {
    let css = '';
    for (const r of rules) {
      if (r.selectorText && r.style) {
        const d = darkDecl(r.style, /:(hover|focus|active)/.test(r.selectorText), r.selectorText);
        if (d) css += `${splitSelectors(r.selectorText)}{${d}}\n`;
      } else if (r.media && r.cssRules) {
        const inner = walkRules(r.cssRules);
        if (inner) css += `@media ${r.media.mediaText}{${inner}}\n`;
      } else if (r.cssRules) {
        css += walkRules(r.cssRules);
      }
    }
    return css;
  }
  const darkDyn = document.createElement('style');
  darkDyn.id = 'fca-dark-dyn';
  const darkInline = document.createElement('style');
  darkInline.id = 'fca-dark-inline';
  // 行內 style 的顏色直接改在元素上（原本的值記在 data-fca-orig，切回日間時還原）。
  // 舊做法是每個元素產生一條 [data-fca-i="N"] 規則，長頁面會有上千條，比對樣式要好幾秒。
  const COLOR_PROPS = ['color', 'background-color', 'background-image', 'border-top-color',
    'border-right-color', 'border-bottom-color', 'border-left-color'];
  function darkInlineFor(root) {
    const els = root.nodeType === 1 && root.hasAttribute('style') ? [root] : [];
    if (root.querySelectorAll) els.push(...root.querySelectorAll('[style]:not([data-fca-orig])'));
    for (const el of els) {
      const st = el.style;
      if (el.hasAttribute('data-fca-orig') || !(st.color || st.backgroundColor || st.backgroundImage || st.borderColor
        || st.borderTopColor || st.borderBottomColor || st.borderLeftColor || st.borderRightColor)) continue;
      const pairs = darkPairs(st, false);
      if (!pairs.length) continue;
      const orig = {};
      for (const p of COLOR_PROPS) orig[p] = [st.getPropertyValue(p), st.getPropertyPriority(p)];
      el.setAttribute('data-fca-orig', JSON.stringify(orig));
      for (const [p, v] of pairs) st.setProperty(p, v, 'important');
    }
  }
  function undoInline() {
    document.querySelectorAll('[data-fca-orig]').forEach(el => {
      try {
        const orig = JSON.parse(el.getAttribute('data-fca-orig'));
        for (const p in orig) {
          if (orig[p][0]) el.style.setProperty(p, orig[p][0], orig[p][1]); else el.style.removeProperty(p);
        }
      } catch (e) { /* ignore */ }
      el.removeAttribute('data-fca-orig');
    });
  }
  // 換算好的深色 CSS 存起來（依網站 CSS 檔案清單當 key），下一頁直接套用，
  // 不用再等頁面載完、也不用重算。網站 CSS 改版時 key 會變，自動重算。
  const DARK_CSS_KEY = 'fca-dark-css-v1';
  let darkKey = '';
  try {
    const c = JSON.parse(localStorage.getItem(DARK_CSS_KEY) || 'null');
    if (c && c.css) { darkKey = c.key; darkDyn.textContent = c.css; }
  } catch (e) { /* ignore */ }
  function sheetKey() {
    const parts = [];
    for (const sh of document.styleSheets) {
      if (sh.ownerNode === darkBase || sh.ownerNode === darkDyn || sh.ownerNode === darkInline) continue;
      try { parts.push((sh.href || 'inline') + '#' + sh.cssRules.length); } catch (e) { /* 跨網域 */ }
    }
    return 'map5|' + parts.join('|');
  }
  function buildDark() {
    const key = sheetKey();
    if (key !== darkKey) {
      let css = '';
      for (const sh of document.styleSheets) {
        if (sh.ownerNode === darkBase || sh.ownerNode === darkDyn || sh.ownerNode === darkInline) continue;
        let rules;
        try { rules = sh.cssRules; } catch (e) { continue; } // 跨網域的 CSS 讀不到就跳過
        css += walkRules(rules);
      }
      darkKey = key;
      darkDyn.textContent = css;
      try { localStorage.setItem(DARK_CSS_KEY, JSON.stringify({ key, css })); } catch (e) { /* ignore */ }
    }
    if (document.head && darkDyn.parentNode !== document.head) document.head.append(darkDyn, darkInline);
  }
  let darkReady = false, darkObserver = null;
  function ensureDark() {
    if (darkReady || !document.body) return;
    darkReady = true;
    buildDark();
    darkInlineFor(document.body);
    // 之後才載入的 CSS、動態加進來的內容也要換色
    window.addEventListener('load', buildDark);
    darkObserver = new MutationObserver(muts => {
      if (!document.documentElement.hasAttribute('data-fca-dark')) return;
      for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) darkInlineFor(n); });
    });
    darkObserver.observe(document.body, { childList: true, subtree: true });
    document.documentElement.setAttribute('data-fca-ready', '');
  }
  function darkPref() {
    try { const v = localStorage.getItem(DARK_KEY); if (v !== null) return v === '1'; } catch (e) { /* ignore */ }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  const darkHooks = [];
  function setDark(on, save) {
    document.documentElement.toggleAttribute('data-fca-dark', on);
    if (on) { if (darkReady) darkInlineFor(document.body); else ensureDark(); } else if (darkReady) undoInline();
    if (save) { try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }
    darkHooks.forEach(f => f(on));
  }
  if (darkDyn.textContent) {
    (document.head || document.documentElement).append(darkDyn, darkInline);
    document.documentElement.setAttribute('data-fca-ready', ''); // 有快取就不用先藏起來等
  }
  setDark(darkPref(), false);
  // 萬一出錯也不要讓頁面一直隱藏
  setTimeout(() => document.documentElement.setAttribute('data-fca-ready', ''), 2500);

  // 其他分頁、或網站彈窗裡的內嵌頁面切換日夜時，這裡也跟著換
  window.addEventListener('storage', e => { if (e.key === DARK_KEY) setDark(e.newValue === '1', false); });

  function main() {
    if (document.documentElement.hasAttribute('data-fca-dark')) ensureDark();
    // 網站的彈窗（例如公告）是用 iframe 載入另一個頁面：裡面只要夜間模式，不要作業按鈕和面板
    let framed = true;
    try { framed = window.top !== window.self; } catch (e) { /* 跨網域的上層視窗 */ }
    if (framed) return;
    const REPO = 'https://github.com/Creeperlol/STUST-Flipclass-Assistant';
    let VERSION = '2.1.0';
    try { VERSION = GM_info.script.version; } catch (e) {
      try { VERSION = chrome.runtime.getManifest().version; } catch (e2) { /* bookmarklet */ }
    }

    const CACHE_KEY = 'fca-cache-v1';
    const CACHE_MS = 30 * 60 * 1000; // 30 分鐘內換頁不重抓（按重新整理隨時可更新）

    // ---------- 資料 ----------
    async function fetchDoc(path) {
      const r = await fetch(path, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
      return { doc, url: r.url };
    }

    function isLoginPage(url, doc) {
      return url.includes('/index/login') || !!doc.getElementById('login_form');
    }

    async function getCourses() {
      // 人就在首頁的話直接讀目前頁面，少抓一次
      const { doc, url } = location.pathname === '/dashboard'
        ? { doc: document, url: location.href } : await fetchDoc('/dashboard');
      if (isLoginPage(url, doc)) return null;
      const map = new Map();
      doc.querySelectorAll('a[href]').forEach(a => {
        const m = a.getAttribute('href').match(/^\/course\/(\d+)$/);
        const name = a.textContent.trim();
        if (m && name && !map.has(m[1])) map.set(m[1], name);
      });
      return [...map].map(([id, name]) => ({ id, name }));
    }

    // 列表只給 "MM-DD HH:MM"（跨年的才有年份、沒時間），依目前學期推回年份
    function inferDate(text, now) {
      const m = text.trim().match(/^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
      if (!m) return null;
      const mon = +m[2], day = +m[3];
      const hh = m[4] ? +m[4] : 23, mi = m[5] ? +m[5] : 59;
      let y;
      if (m[1]) y = +m[1];
      else if (now.getMonth() + 1 >= 8 || now.getMonth() + 1 === 1) {
        const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        y = mon >= 7 ? start : start + 1;
      } else y = now.getFullYear();
      return new Date(y, mon - 1, day, hh, mi);
    }

    async function getHomework(course, now) {
      const { doc } = await fetchDoc('/course/homeworkList/' + course.id);
      const table = doc.querySelector('table');
      if (!table) return [];
      // 用欄位的 CSS class 找欄位，網站切換成任何語言都一樣：
      // 期限 = 最後一個 col-date、繳交 = col-char2、成績 = 繳交的下一欄
      const out = [];
      table.querySelectorAll('tbody tr').forEach(tr => {
        const a = tr.querySelector('a[href^="/course/homework/"]');
        if (!a) return;
        const dates = tr.querySelectorAll('td.col-date');
        const termTd = dates[dates.length - 1];
        const submitTd = tr.querySelector('td.col-char2');
        const scoreTd = submitTd && submitTd.nextElementSibling;
        const termText = termTd ? termTd.textContent.trim() : '';
        const d = inferDate(termText, now);
        out.push({
          course: course.name,
          title: a.getAttribute('title') || a.textContent.trim(),
          href: a.getAttribute('href'),
          deadline: d ? d.getTime() : null,
          termText,
          submitted: !!(submitTd && submitTd.querySelector('.fa-check')),
          score: scoreTd ? scoreTd.textContent.trim() : '',
        });
      });
      return out;
    }

    async function mapLimit(arr, n, fn) {
      const out = new Array(arr.length);
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => {
        while (i < arr.length) { const k = i++; out[k] = await fn(arr[k]); }
      }));
      return out;
    }
    // 等頁面自己載完、瀏覽器空閒時才做背景工作
    function whenIdle(fn) {
      const go = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 800));
      if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
    }

    async function loadAll(force) {
      if (!force) {
        try {
          const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
          if (c && Date.now() - c.time < CACHE_MS) return c;
        } catch (e) { /* ignore */ }
      }
      const courses = await getCourses();
      if (!courses) return null; // 沒登入
      const now = new Date();
      // 一次最多同時抓 3 門課，不要把網站自己載入頁面需要的連線佔滿
      const lists = await mapLimit(courses, 3, c => getHomework(c, now).catch(() => []));
      const data = { time: Date.now(), items: lists.flat() };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
      return data;
    }

    function statusOf(h, now) {
      if (h.submitted) return 'done';
      if (h.deadline && h.deadline < now) return 'missed';
      return 'todo';
    }


    // ---------- 語言：跟著 FlipClass 右上角選的語言（English / 繁體 / 简体） ----------
    const I18N = {
      en: {
        fab: 'Assignments', showAll: 'Show all assignments', title: 'Assignments', refresh: 'Refresh', close: 'Close', dark: 'Dark mode', light: 'Light mode', noLate: 'No late submission', dueSoon: n => `${n} due within 24 hours`, ics: 'Export to calendar (.ics)', allCourses: 'All courses', sortDue: 'Sort: deadline', sortCourse: 'Sort: course', ttNote: 'Filled in from course syllabi (only shown in this browser)', ttReload: 'Reload', ttLoading: 'Loading class times…', ttFail: 'Could not load class times', avatar: 'Change photo', avatarReset: 'Reset photo', crop: 'Adjust photo', cropHint: 'Drag to move · scroll or slide to zoom', save: 'Save', cancel: 'Cancel', zoom: 'Zoom',
        todo: 'To do', missed: 'Overdue', done: 'Submitted', all: 'All',
        updated: (t, n) => `Updated ${t} · ${n} total`,
        left: (d, h) => d > 0 ? `${d}d ${h}h left` : `${h}h left`,
        search: 'Search assignments or courses', loading: 'Loading…', empty: 'Nothing here 🎉',
        noMatch: 'No matching assignments', error: 'Failed to load. Tap refresh to try again.',
      },
      'zh-TW': {
        fab: '作業', showAll: '所有作業', title: '作業總覽', refresh: '重新整理', close: '關閉', dark: '夜間模式', light: '日間模式', noLate: '不可遲交', dueSoon: n => `${n} 份 24 小時內到期`, ics: '匯出到行事曆（.ics）', allCourses: '全部課程', sortDue: '依截止日', sortCourse: '依課程', ttNote: '已從課程大綱自動填入（只顯示在這個瀏覽器）', ttReload: '重新抓取', ttLoading: '正在讀取上課時間…', ttFail: '讀取上課時間失敗', avatar: '更換頭像', avatarReset: '還原頭像', crop: '調整頭像', cropHint: '拖曳移動位置・滾輪或拉桿縮放', save: '儲存', cancel: '取消', zoom: '縮放',
        todo: '進行中', missed: '已過期', done: '已繳交', all: '全部',
        updated: (t, n) => `更新於 ${t}・共 ${n} 份`,
        left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小時` : `剩 ${h} 小時`,
        search: '搜尋作業或課程', loading: '載入中…', empty: '這裡沒有作業 🎉',
        noMatch: '找不到符合的作業', error: '讀取失敗，請按重新整理再試一次',
      },
      'zh-CN': {
        fab: '作业', showAll: '所有作业', title: '作业总览', refresh: '刷新', close: '关闭', dark: '夜间模式', light: '日间模式', noLate: '不可迟交', dueSoon: n => `${n} 份 24 小时内到期`, ics: '导出到日历（.ics）', allCourses: '全部课程', sortDue: '按截止日', sortCourse: '按课程', ttNote: '已从课程大纲自动填入（只显示在这个浏览器）', ttReload: '重新获取', ttLoading: '正在读取上课时间…', ttFail: '读取上课时间失败', avatar: '更换头像', avatarReset: '还原头像', crop: '调整头像', cropHint: '拖动移动位置・滚轮或拉杆缩放', save: '保存', cancel: '取消', zoom: '缩放',
        todo: '进行中', missed: '已过期', done: '已缴交', all: '全部',
        updated: (t, n) => `更新于 ${t}・共 ${n} 份`,
        left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小时` : `剩 ${h} 小时`,
        search: '搜索作业或课程', loading: '加载中…', empty: '这里没有作业 🎉',
        noMatch: '找不到符合的作业', error: '读取失败，请按刷新再试一次',
      },
    };
    // 狀態標籤（卡片上的小標）比篩選卡片多帶「未繳」
    const TAG = {
      en: { todo: 'Not submitted', missed: 'Overdue', done: 'Submitted' },
      'zh-TW': { todo: '未繳・進行中', missed: '未繳・已過期', done: '已繳交' },
      'zh-CN': { todo: '未缴・进行中', missed: '未缴・已过期', done: '已缴交' },
    };
    function detectLang() {
      const l = (document.documentElement.lang || '').toLowerCase();
      if (l.startsWith('en')) return 'en';
      if (/zh[-_](cn|sg|hans)/.test(l)) return 'zh-CN';
      if (l.startsWith('zh')) return 'zh-TW';
      // 沒有 lang 屬性時，看右上角語言選單目前顯示的文字
      const cur = document.querySelector('.fa-globe');
      const txt = cur ? cur.parentElement.textContent.trim() : '';
      if (txt.includes('简体')) return 'zh-CN';
      if (txt.includes('繁體')) return 'zh-TW';
      return txt.includes('English') ? 'en' : 'zh-TW';
    }
    const LANG = detectLang();
    const T = I18N[LANG], TG = TAG[LANG];

    const ORDER = { todo: 0, missed: 1, done: 2 };

    const ICON = {
      refresh: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
      moon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
      sun: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
      close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      search: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
      cal: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
      ics: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5 12 18l2.5-2.5"/></svg>',
      book: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>',
    };

    // ---------- 介面（Shadow DOM，不受網站 CSS 影響） ----------
    const host = document.createElement('div');
    host.id = 'fca-host';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
  <style>
  :host{all:initial;--top:0px;--ease:cubic-bezier(.22,1,.36,1);
    --bg:#141518;--panel:#1c1d21;--panel2:#24262b;--line:#2f3137;--line2:#43464d;
    --ink:#ececec;--sub:#8c8f96;--dim:#5d6067;--acc:#ffd23c;
    --todo:#ffd23c;--missed:#ff5a4e;--done:#35c9c1;--all:#ececec}
  *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI","Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif}
  button{font:inherit;color:inherit}
  .num,.stat .n,.left,.idx,.code,.meta{font-family:Bahnschrift,"DIN Alternate","Roboto Condensed","Arial Narrow",system-ui,sans-serif;font-variant-numeric:tabular-nums}

  /* 浮動按鈕（只在沒有網站導覽列時出現） */
  .fab{position:fixed;right:16px;bottom:16px;z-index:2147483645;border:0;border-radius:0;
    background:var(--bg);color:var(--ink);padding:12px 18px 12px 16px;font-size:15px;font-weight:700;
    border-left:4px solid var(--acc);cursor:pointer;display:flex;gap:8px;align-items:center;transition:background .15s}
  .fab:hover{background:#26282d}
  .fab .b{color:var(--acc)}
  .fab .b.ok{color:var(--done)}
@media (min-width:992px){.fab.nd{display:none}}
  @media (max-width:991px){.fab.nm{display:none}}

  /* 背景遮罩 */
  .mask{position:fixed;left:0;right:0;bottom:0;top:var(--top);z-index:2147483646;
    background:rgba(8,9,11,.55);opacity:0;pointer-events:none;transition:opacity .35s var(--ease)}
  :host(.open) .mask{opacity:1;pointer-events:auto}

  /* 右側抽屜 */
  .drawer{position:fixed;right:0;bottom:0;top:var(--top);z-index:2147483647;width:min(640px,100vw);
    background:var(--bg);color:var(--ink);display:flex;flex-direction:column;
    transform:translateX(104%);visibility:hidden;
    transition:transform .42s var(--ease),visibility 0s linear .42s}
  :host(.open) .drawer{transform:none;visibility:visible;transition:transform .42s var(--ease),visibility 0s}
  .drawer::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acc)}

  /* 標題 */
  .hd{padding:20px 22px 0;flex:none;position:relative}
  .hd-row{display:flex;align-items:flex-start;gap:6px}
  .ttl{flex:1;min-width:0}
  .code{font-size:11px;letter-spacing:3px;color:var(--acc);font-weight:600}
  .code .ver{color:inherit;text-decoration:none}
  .code .ver:hover{text-decoration:underline}
  .hd h2{margin:2px 0 0;font-size:26px;font-weight:800;letter-spacing:1px;line-height:1.15}
  .icon-btn{border:1px solid var(--line2);background:transparent;color:var(--ink);width:36px;height:36px;border-radius:0;
    display:grid;place-items:center;cursor:pointer;transition:background .15s,border-color .15s,color .15s}
  .icon-btn:hover{background:var(--acc);border-color:var(--acc);color:#111}
  .icon-btn.spin svg{animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .meta{font-size:12px;color:var(--sub);margin-top:10px;min-height:16px;letter-spacing:.5px;
    display:flex;align-items:center;gap:10px}
  .meta::after{content:"";flex:1;height:6px;
    background:repeating-linear-gradient(-45deg,var(--line2) 0 2px,transparent 2px 6px)}

  /* 統計 */
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin:16px 22px 0;flex:none;
    border:1px solid var(--line)}
  .stat{border:0;border-right:1px solid var(--line);background:transparent;border-radius:0;padding:12px 14px 12px;
    text-align:left;cursor:pointer;position:relative;transition:background .15s}
  .stat:last-child{border-right:0}
  .stat::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--c);
    transform:scaleX(0);transform-origin:left;transition:transform .25s var(--ease)}
  .stat:hover{background:var(--panel)}
  .stat.on{background:var(--panel2)}
  .stat.on::after{transform:none}
  .stat.todo{--c:var(--todo)}.stat.missed{--c:var(--missed)}.stat.done{--c:var(--done)}.stat.all{--c:var(--all)}
  .stat .n{font-size:30px;font-weight:600;line-height:1;color:var(--c)}
  .stat .l{font-size:12px;color:var(--sub);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

  /* 搜尋 */
  .search{margin:14px 22px 4px;position:relative;flex:none;display:block}
  .search svg{position:absolute;left:0;top:50%;transform:translateY(-50%);color:var(--dim)}
  .search input{width:100%;border:0;border-bottom:1px solid var(--line2);background:transparent;border-radius:0;
    padding:10px 4px 10px 26px;font-size:14px;color:var(--ink);outline:none;transition:border-color .15s}
  .search input::placeholder{color:var(--dim)}
  .search input:focus{border-bottom-color:var(--acc)}
  .tools{display:flex;gap:8px;margin:8px 22px 2px;flex:none}
  .tools select{flex:1;min-width:0;background:var(--panel);color:var(--ink);border:1px solid var(--line2);border-radius:0;
    padding:6px 8px;font:inherit;font-size:13px;outline:none;cursor:pointer}
  .tools select.sort{flex:none;width:auto}
  .tools select:focus{border-color:var(--acc)}
  .stat .u{position:absolute;right:8px;top:8px;background:var(--missed);color:#fff;font-size:11px;font-weight:700;
    padding:0 6px;line-height:17px}

  /* 清單 */
  .list{flex:1;overflow:auto;padding:8px 22px 28px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
    scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
  .item{position:relative;display:block;text-decoration:none;color:inherit;background:var(--panel);border-radius:0;
    padding:12px 14px 12px 18px;margin-top:8px;border:1px solid transparent;
    clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);
    transition:background .15s,border-color .15s;animation:rise .3s ease both}
  .item::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c)}
  .item.todo{--c:var(--todo)}.item.missed{--c:var(--missed)}.item.done{--c:var(--done)}
  .item.urgent{--c:var(--missed);border-color:rgba(255,90,78,.35)}
  .item.urgent::before{animation:pulse 1.4s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.35}}
  .item:hover{background:var(--panel2)}
  @keyframes rise{from{opacity:0}to{opacity:1}}
  .top-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .idx{font-size:12px;color:var(--dim);letter-spacing:1px}
  .tag{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:0;white-space:nowrap;background:var(--c);color:#111}
  .item.done .tag{background:transparent;color:var(--c);box-shadow:inset 0 0 0 1px var(--c)}
  .tag.nolate{background:transparent;color:var(--missed);box-shadow:inset 0 0 0 1px var(--missed)}
  .left{margin-left:auto;font-size:13px;font-weight:600;white-space:nowrap;color:var(--sub);letter-spacing:.5px}
  .left.soon{color:var(--todo)}
  .left.urgent{color:var(--missed)}
  .score{margin-left:auto;font-size:12.5px;color:var(--sub)}
  .title{font-size:15px;font-weight:600;line-height:1.45;margin-top:8px;color:var(--ink)}
  .item.done .title{color:var(--sub);font-weight:500}
  .sub{display:flex;gap:16px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--sub)}
  .sub span{display:inline-flex;align-items:center;gap:5px;min-width:0}
  .msg{padding:48px 14px;text-align:center;color:var(--sub);font-size:14px;animation:rise .4s var(--ease) both}
  .skel{height:86px;margin-top:8px;background:linear-gradient(90deg,var(--panel) 25%,var(--panel2) 50%,var(--panel) 75%);
    background-size:200% 100%;animation:shimmer 1.2s linear infinite}
  @keyframes shimmer{to{background-position:-200% 0}}

  @media (max-width:600px){
    .hd{padding:16px 16px 0}.stats{margin:12px 16px 0}.search{margin:10px 16px 4px}.list{padding:4px 16px 20px}
    .tools{margin:8px 16px 2px}
    .hd h2{font-size:22px}.stat{padding:10px 9px}.stat .n{font-size:24px}.stat .l{font-size:11px}
    .fab{right:12px;bottom:12px}
  }
  /* 頭像裁切 */
  .crop{position:fixed;inset:0;z-index:2147483647;background:rgba(8,9,11,.6);display:none;place-items:center;padding:16px}
  .crop.on{display:grid;animation:rise .2s ease both}
  .crop-card{background:var(--bg);color:var(--ink);width:min(340px,100%);padding:18px 20px 16px;position:relative}
  .crop-card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acc)}
  .crop-card h3{margin:2px 0 4px;font-size:18px;font-weight:800;letter-spacing:.5px}
  .crop-hint{font-size:12px;color:var(--sub);margin-bottom:12px}
  .stage{position:relative;width:100%;aspect-ratio:1;overflow:hidden;background:#0b0c0e;cursor:grab;touch-action:none;user-select:none}
  .stage.drag{cursor:grabbing}
  .stage img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;pointer-events:none;-webkit-user-drag:none}
  .ring{position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 999px rgba(8,9,11,.6);outline:1px solid rgba(255,255,255,.6);pointer-events:none}
  .zoom-row{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:12px;color:var(--sub)}
  .zoom-row input{flex:1;accent-color:var(--acc)}
  .crop-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
  .btn{border:1px solid var(--line2);background:transparent;color:var(--ink);padding:8px 16px;font-size:14px;font-weight:600;cursor:pointer;border-radius:0;
    transition:background .15s,border-color .15s,color .15s}
  .btn:hover{border-color:var(--ink)}
  .btn.primary{background:var(--acc);border-color:var(--acc);color:#111}
  .btn.primary:hover{background:#ffdd66}

  @media (prefers-reduced-motion:reduce){
    *,.drawer,:host(.open) .drawer{animation:none!important;transition:none!important}
  }
  </style>
  <div class="mask"></div>
  <button class="fab" title="${T.title}">${T.fab} <span class="b">…</span></button>
  <aside class="drawer" role="dialog" aria-modal="true" aria-label="${T.title}">
    <div class="hd">
      <div class="hd-row"><div class="ttl"><div class="code">ASSIGNMENT / STUST FLIPCLASS · <a class="ver" href="${REPO}" target="_blank" rel="noopener" title="GitHub">V${VERSION}</a></div><h2>${T.title}</h2></div>
        <button class="icon-btn ics" title="${T.ics}" aria-label="${T.ics}">${ICON.ics}</button>
        <button class="icon-btn theme"></button>
        <button class="icon-btn refresh" title="${T.refresh}" aria-label="${T.refresh}">${ICON.refresh}</button>
        <button class="icon-btn close" title="${T.close}" aria-label="${T.close}">${ICON.close}</button></div>
      <div class="meta"></div>
    </div>
    <div class="stats"></div>
    <label class="search">${ICON.search}<input type="search" placeholder="${T.search}" aria-label="${T.search}"></label>
    <div class="tools"><select class="course" aria-label="${T.allCourses}"></select>
      <select class="sort" aria-label="${T.sortDue}"><option value="due">${T.sortDue}</option><option value="course">${T.sortCourse}</option></select></div>
    <div class="list"></div>
  </aside>
  <div class="crop" role="dialog" aria-modal="true" aria-label="${T.crop}">
    <div class="crop-card">
      <h3>${T.crop}</h3>
      <div class="crop-hint">${T.cropHint}</div>
      <div class="stage"><img alt=""><div class="ring"></div></div>
      <label class="zoom-row">${T.zoom}<input type="range" min="1" max="4" step="0.01" value="1"></label>
      <div class="crop-btns"><button class="btn crop-cancel">${T.cancel}</button><button class="btn primary crop-save">${T.save}</button></div>
    </div>
  </div>`;

    const $ = s => root.querySelector(s);
    let data = null, filter = 'todo', query = '';
    let fitNav = () => {};
    const UI_KEY = 'fca-ui-v1';
    let ui = { course: '', sort: 'due' };
    try { ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY) || '{}') }; } catch (e) { /* ignore */ }
    const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* ignore */ } };
    const DAY_MS = 24 * 3600 * 1000;

    function fmt(ts) {
      const d = new Date(ts), p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    function leftInfo(ts, now) {
      const ms = ts - now, h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
      return { text: T.left(d, h % 24), cls: h < 24 ? 'urgent' : h < 72 ? 'soon' : '' };
    }
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function skeleton() { $('.list').innerHTML = '<div class="skel"></div>'.repeat(5); }

    function render() {
      const now = Date.now();
      if (!data) return;
      const items = data.items.map(h => ({ ...h, st: statusOf(h, now) }));
      items.forEach(h => { h.urgent = h.st === 'todo' && h.deadline && h.deadline - now < DAY_MS; });
      const n = { todo: 0, missed: 0, done: 0, all: items.length };
      items.forEach(h => n[h.st]++);
      const nUrgent = items.filter(h => h.urgent).length;

      const badge = $('.fab .b');
      badge.textContent = n.todo;
      badge.classList.toggle('ok', n.todo === 0);
      document.querySelectorAll('.fca-nav-badge').forEach(b => {
        b.innerHTML = `(${n.todo})` + (nUrgent ? `<span class="fca-nav-urgent" title="${esc(T.dueSoon(nUrgent))}">${nUrgent}</span>` : '');
      });
      fitNav();
      updateHomeworkPage(items, now);

      $('.meta').textContent = T.updated(fmt(data.time), items.length);
      $('.stats').innerHTML = ['todo', 'missed', 'done', 'all'].map(k =>
        `<button class="stat ${k}${k === filter ? ' on' : ''}" data-f="${k}" aria-pressed="${k === filter}">
           ${k === 'todo' && nUrgent ? `<span class="u" title="${esc(T.dueSoon(nUrgent))}">${nUrgent}</span>` : ''}
           <div class="n">${n[k]}</div><div class="l">${T[k]}</div></button>`).join('');

      // 課程下拉選單：只列有作業的課
      const courses = [...new Set(items.map(h => h.course))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
      if (ui.course && !courses.includes(ui.course)) ui.course = '';
      $('.tools .course').innerHTML = `<option value="">${T.allCourses}</option>` +
        courses.map(c => `<option value="${esc(c)}"${c === ui.course ? ' selected' : ''}>${esc(c)}</option>`).join('');
      $('.tools .sort').value = ui.sort;

      const q = query.trim().toLowerCase();
      const shown = items
        .filter(h => filter === 'all' || h.st === filter)
        .filter(h => !ui.course || h.course === ui.course)
        .filter(h => !q || (h.title + ' ' + h.course).toLowerCase().includes(q))
        .sort((a, b) => {
          if (ui.sort === 'course' && a.course !== b.course) return a.course.localeCompare(b.course, 'zh-Hant');
          if (ORDER[a.st] !== ORDER[b.st]) return ORDER[a.st] - ORDER[b.st];
          const da = a.deadline ?? Infinity, db = b.deadline ?? Infinity;
          return a.st === 'todo' ? da - db : db - da;
        });

      $('.list').innerHTML = shown.length ? shown.map((h, i) => {
        const left = h.st === 'todo' && h.deadline ? leftInfo(h.deadline, now) : null;
        const score = h.st === 'done' && h.score && h.score !== '-' ? `<span class="score">${esc(h.score)}</span>` : '';
        return `
        <a class="item ${h.st}${h.urgent ? ' urgent' : ''}" href="${esc(h.href)}" style="animation-delay:${Math.min(i, 12) * 28}ms">
          <div class="top-row"><span class="idx">${String(i + 1).padStart(2, '0')}</span><span class="tag">${TG[h.st]}</span>${h.st === 'missed' && lateOK(h) === false ? `<span class="tag nolate">${T.noLate}</span>` : ''}
            ${left ? `<span class="left ${left.cls}">${left.text}</span>` : score}</div>
          <div class="title">${esc(h.title)}</div>
          <div class="sub"><span>${ICON.cal}${h.deadline ? fmt(h.deadline) : esc(h.termText)}</span>
            <span>${ICON.book}${esc(h.course)}</span></div>
        </a>`;
      }).join('') : `<div class="msg">${q ? T.noMatch : T.empty}</div>`;
    }

    // ---------- 作業內容頁：截止時間旁邊顯示狀態和倒數 ----------
    function updateHomeworkPage(items, now) {
      const m = location.pathname.match(/^\/course\/homework\/(\d+)/);
      if (!m) return;
      // 開始／截止時間都是 "YYYY-MM-DD HH:MM"，最後一個就是截止時間（不看標籤文字，任何語言都適用）
      const dds = [...document.querySelectorAll('dl dd')].filter(dd =>
        !dd.closest('.fca-hw') && /^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(dd.firstChild ? dd.firstChild.textContent.trim() : ''));
      const dd = dds[dds.length - 1];
      if (!dd) return;
      const t = dd.firstChild.textContent.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
      const deadline = new Date(+t[1], t[2] - 1, +t[3], +t[4], +t[5]).getTime();
      const h = items.find(x => hwId(x) === m[1]);
      const st = h ? h.st : (deadline < now ? null : 'open');
      let html = '';
      if (st === 'done') html = `<span class="t fca-done">${TG.done}</span>`;
      else if (st === 'missed') html = `<span class="t fca-missed">${TG.missed}</span>`;
      else if (st) {
        const left = leftInfo(deadline, now);
        html = (h ? `<span class="t fca-todo">${TG.todo}</span>` : '') +
          `<span class="${left.cls === 'urgent' ? 'fca-missed' : left.cls === 'soon' ? 'fca-todo' : 'fca-sub'}">${left.text}</span>`;
      }
      let box = dd.querySelector('.fca-hw');
      if (!html) { if (box) box.remove(); return; }
      if (!box) { box = document.createElement('span'); box.className = 'fca-hw'; dd.appendChild(box); }
      box.innerHTML = html;
    }

    // ---------- 課程作業列表：沒交的整列標底色 ----------
    function markHomeworkList() {
      if (!/^\/course\/homeworkList\/\d+/.test(location.pathname)) return;
      const now = new Date();
      document.querySelectorAll('table tbody tr').forEach(tr => {
        if (!tr.querySelector('a[href^="/course/homework/"]')) return;
        const submitTd = tr.querySelector('td.col-char2');
        if (!submitTd || submitTd.querySelector('.fa-check')) return;
        const dates = tr.querySelectorAll('td.col-date');
        const d = dates.length ? inferDate(dates[dates.length - 1].textContent, now) : null;
        tr.classList.add(d && d < now ? 'fca-row-missed' : 'fca-row-todo');
      });
    }

    // ---------- 匯出到行事曆（.ics）：未繳、還沒過期的作業 ----------
    function exportIcs() {
      if (!data) return;
      const now = Date.now();
      const list = data.items.filter(h => statusOf(h, now) === 'todo' && h.deadline);
      const z = ts => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const e = v => String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
      const enc = new TextEncoder();
      const fold = line => { // 每行最多 75 bytes，超過就折行（中文一個字 3 bytes）
        let out = '', cur = '', n = 0;
        for (const ch of line) {
          const b = enc.encode(ch).length;
          if (n + b > (out ? 74 : 75)) { out += (out ? '\r\n ' : '') + cur; cur = ''; n = 0; }
          cur += ch; n += b;
        }
        return out + (out ? '\r\n ' : '') + cur;
      };
      const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//STUST Flipclass Assistant//EN', 'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH', 'X-WR-CALNAME:FlipClass'];
      list.forEach(h => {
        const url = new URL(h.href, location.origin).href;
        L.push('BEGIN:VEVENT', `UID:fca-${hwId(h) || encodeURIComponent(h.href)}@flipclass.stust.edu.tw`, `DTSTAMP:${z(now)}`,
          `DTSTART:${z(h.deadline - 30 * 60000)}`, `DTEND:${z(h.deadline)}`, `SUMMARY:${e(h.title)}`,
          `DESCRIPTION:${e(h.course + '\n' + url)}`, `URL:${url}`,
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(h.title)}`, 'TRIGGER:-P1D', 'END:VALARM',
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(h.title)}`, 'TRIGGER:-PT3H', 'END:VALARM', 'END:VEVENT');
      });
      L.push('END:VCALENDAR');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([L.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' }));
      a.download = 'flipclass-assignments.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }

    // ---------- 我的課表：從課程大綱抓上課時間自動填入（只顯示，不會存到網站） ----------
    const TT_KEY = 'fca-tt-v1';
    const TT_MS = 7 * DAY_MS;
    const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    function periodOf(label) { // 「第十一節」→ 11
      const m = label.match(/第\s*([一二三四五六七八九十\d]+)\s*節/);
      if (!m) return null;
      const t = m[1];
      if (/^\d+$/.test(t)) return +t;
      const i = t.indexOf('十');
      if (i < 0) return CN[t] || null;
      return (i ? CN[t[0]] : 1) * 10 + (t[i + 1] ? CN[t[i + 1]] : 0);
    }
    function syllabusSlots(list) {
      // 課程大綱在另一個網域，不能直接 fetch：用看不見的 iframe 打開，裡面的這支腳本會把上課時間 postMessage 回來
      return new Promise(resolve => {
        const got = {}, frames = [];
        let left = list.length;
        const finish = () => { clearTimeout(timer); window.removeEventListener('message', onMsg); frames.forEach(f => f.remove()); resolve(got); };
        const timer = setTimeout(finish, 20000);
        function onMsg(ev) {
          const d = ev.data;
          if (ev.origin !== 'https://webap.stust.edu.tw' || !d || d.fcaTimetable !== 1 || typeof d.code !== 'string' || d.code in got) return;
          got[d.code] = (Array.isArray(d.slots) ? d.slots : []).filter(x => x && x.day >= 1 && x.day <= 7 && x.p >= 1 && x.p <= 20)
            .map(x => ({ day: +x.day, p: +x.p, room: String(x.room || '').slice(0, 40) }));
          if (--left <= 0) finish();
        }
        window.addEventListener('message', onMsg);
        list.forEach(c => {
          const f = document.createElement('iframe');
          f.src = c.src;
          f.tabIndex = -1;
          f.setAttribute('aria-hidden', 'true');
          f.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;border:0;visibility:hidden';
          document.body.appendChild(f);
          frames.push(f);
        });
      });
    }
    async function loadTimetable(force) {
      if (!force) {
        try { const c = JSON.parse(localStorage.getItem(TT_KEY) || 'null'); if (c && Date.now() - c.time < TT_MS) return c; } catch (e) { /* ignore */ }
      }
      const courses = await getCourses();
      if (!courses) return null;
      const infos = (await mapLimit(courses, 3, async c => {
        try {
          const { doc } = await fetchDoc('/course/info/' + c.id);
          const f = doc.querySelector('iframe[src*="webap.stust.edu.tw/courinfo/"]');
          if (!f) return null;
          const u = new URL(f.getAttribute('src'), location.href);
          if (u.origin !== 'https://webap.stust.edu.tw') return null;
          return { ...c, src: u.href, code: u.searchParams.get('subcode'), term: +u.searchParams.get('year') * 10 + +u.searchParams.get('semes') };
        } catch (e) { return null; }
      })).filter(x => x && x.code);
      if (!infos.length) return { time: Date.now(), items: [] };
      const term = Math.max(...infos.map(x => x.term)); // 只要這學期的課
      const cur = infos.filter(x => x.term === term);
      const got = await syllabusSlots(cur);
      if (!Object.keys(got).length) throw new Error('no syllabus');
      const tt = { time: Date.now(), items: cur.flatMap(c => (got[c.code] || []).map(x => ({ ...x, id: c.id, name: c.name }))) };
      try { localStorage.setItem(TT_KEY, JSON.stringify(tt)); } catch (e) { /* ignore */ }
      return tt;
    }
    function renderTimetable(tt) {
      const table = [...document.querySelectorAll('table')].find(t => t.tBodies[0] && periodOf(t.tBodies[0].textContent || ''));
      if (!table) return;
      table.querySelectorAll('.fca-tt').forEach(e => e.remove());
      const rows = {};
      [...table.tBodies[0].rows].forEach(tr => { const p = tr.cells[0] && periodOf(tr.cells[0].textContent); if (p) rows[p] = tr; });
      tt.items.forEach(x => {
        const td = rows[x.p] && rows[x.p].cells[x.day];
        if (!td) return;
        const div = document.createElement('div');
        div.className = 'fca-tt';
        div.innerHTML = `<a href="/course/${esc(x.id)}">${esc(x.name.replace(/_[^_]*$/, ''))}</a>${x.room ? `<small>${esc(x.room)}</small>` : ''}`;
        td.appendChild(div);
      });
    }
    async function mountTimetable() {
      if (location.pathname !== '/dashboard/myTimeTable') return;
      const setting = document.querySelector('a[data-url*="myTimeTableSetting"]');
      const note = document.createElement('span');
      note.className = 'fca-nav fca-tt-note';
      if (setting) setting.after(note); else return;
      const run = async force => {
        note.textContent = T.ttLoading;
        try {
          const tt = await loadTimetable(force);
          if (!tt) { note.remove(); return; }
          renderTimetable(tt);
          note.innerHTML = `${esc(T.ttNote)} · <a href="#">${esc(T.ttReload)}</a>`;
          note.querySelector('a').addEventListener('click', e => { e.preventDefault(); run(true); });
        } catch (e) {
          note.innerHTML = `${esc(T.ttFail)} · <a href="#">${esc(T.ttReload)}</a>`;
          note.querySelector('a').addEventListener('click', ev => { ev.preventDefault(); run(true); });
        }
      };
      run(false);
    }

    // ---------- 是否允許遲交（只查已過期的，查過就記住） ----------
    // 作業列表沒有這個欄位，要看作業內容頁的「Allow late submission / 允許遲交」那一行
    const LATE_KEY = 'fca-late-v1';
    let late = {};
    try { late = JSON.parse(localStorage.getItem(LATE_KEY) || '{}') || {}; } catch (e) { /* ignore */ }
    const hwId = h => (String(h.href).match(/\/course\/homework\/(\d+)/) || [])[1];
    function lateOK(h) { const id = hwId(h); return id && id in late ? late[id] : undefined; }
    async function fetchLate(h) {
      const { doc } = await fetchDoc(h.href);
      for (const dt of doc.querySelectorAll('dt')) {
        if (!/late|遲交|迟交|補交|补交|逾期/i.test(dt.textContent)) continue;
        const dd = dt.nextElementSibling;
        if (!dd) break;
        const v = dd.textContent.trim();
        return !/^(no|否|不)/i.test(v) && !/不允許|不允许|不可/.test(v);
      }
      return undefined; // 頁面上沒有這一行
    }
    let lateBusy = false;
    function checkLate() {
      if (lateBusy || !data) return;
      const now = Date.now();
      const todo = data.items.filter(h => statusOf(h, now) === 'missed' && hwId(h) && !(hwId(h) in late));
      if (!todo.length) return;
      lateBusy = true;
      whenIdle(async () => {
        try {
          await mapLimit(todo, 3, async h => {
            try { const v = await fetchLate(h); if (v !== undefined) late[hwId(h)] = v; } catch (e) { /* 下次再試 */ }
          });
          try { localStorage.setItem(LATE_KEY, JSON.stringify(late)); } catch (e) { /* ignore */ }
          render();
        } finally { lateBusy = false; }
      });
    }

    async function refresh(force) {
      const btn = $('.refresh');
      btn.classList.add('spin');
      if (!data) skeleton();
      try {
        data = await loadAll(force);
      } catch (e) {
        $('.list').innerHTML = `<div class="msg">${T.error}</div>`;
        return;
      } finally {
        btn.classList.remove('spin');
      }
      if (!data) { // 沒登入就不顯示
        host.remove();
        document.querySelectorAll('.fca-nav').forEach(e => e.remove());
        return;
      }
      render();
      checkLate();
    }

    // ---------- 放進網站導覽列 ----------
    // 電腦版：上方導覽列「我的課程」左邊；手機版：上方 ☰ 列、👤 圖示左邊。
    // 找不到導覽列的頁面才用右下角浮動按鈕。
    const BADGE_STYLE = 'margin-left:4px';
    function mountNav() {
      const open = e => { e.preventDefault(); setOpen(true); };

      const myCourses = document.querySelector('nav.fs-sysbar ul.navbar-right a[href="/dashboard"]');
      const li0 = myCourses && myCourses.closest('li');
      if (li0) {
        const li = document.createElement('li');
        li.className = 'fca-nav';
        li.innerHTML = `<a href="#" title="${T.title}"><span class="text">${T.fab}</span><span class="fca-nav-badge" style="${BADGE_STYLE}"></span></a>`;
        li.firstChild.addEventListener('click', open);
        li0.before(li);

        // 右上角：插件名稱和版本，點了開 GitHub
        const nav = li0.closest('nav');
        const about = document.createElement('div');
        about.className = 'fca-nav fca-about';
        about.innerHTML = `<a href="${REPO}" target="_blank" rel="noopener" title="GitHub">STUST Flipclass Assistant<br>v${VERSION}</a>`;
        if (getComputedStyle(nav).position === 'static') nav.style.position = 'relative';
        nav.appendChild(about);
        const ul = li0.closest('ul');
        const aboutLi = document.createElement('li');
        aboutLi.className = 'fca-nav fca-about-li';
        aboutLi.innerHTML = `<a href="${REPO}" target="_blank" rel="noopener" title="STUST Flipclass Assistant · GitHub">v${VERSION}</a>`;
        ul.appendChild(aboutLi);
        // 導覽列被擠成兩行時：先藏版本標示，還是放不下就把「作業」按鈕左右留白縮小
        const brandEl = nav.querySelector('.navbar-header');
        const wrapped = () => innerWidth >= 768 && brandEl &&
          ul.getBoundingClientRect().top - brandEl.getBoundingClientRect().top > 10;
        fitNav = () => {
          nav.classList.remove('fca-tight');
          aboutLi.style.display = '';
          if (wrapped()) aboutLi.style.display = 'none';
          if (wrapped()) nav.classList.add('fca-tight');
        };
        fitNav();
        window.addEventListener('resize', fitNav);
        window.addEventListener('load', fitNav, { once: true });
        $('.fab').classList.add('nd');
      }

      // 電腦版：日夜切換放在左上角網站名稱右邊
      const brand = document.querySelector('nav.fs-sysbar .navbar-header > .navbar-brand');
      if (brand) {
        const d = document.createElement('a');
        d.href = '#';
        d.className = 'navbar-brand fca-nav fca-theme';
        d.style.marginLeft = '4px';
        d.innerHTML = '<span class="font-icon fas" aria-hidden="true"></span>';
        d.addEventListener('click', toggleDark);
        brand.after(d);
      }

      const btns = document.querySelector('.navbar-header .fs-navbar-btns');
      if (btns) {
        const a = document.createElement('a');
        a.href = '#';
        a.className = 'navbar-brand fca-nav';
        a.title = T.title;
        a.setAttribute('aria-label', T.title);
        a.innerHTML = `<span class="font-icon far fa-clipboard" aria-hidden="true"></span><span class="fca-nav-badge" style="${BADGE_STYLE}"></span>`;
        a.addEventListener('click', open);
        btns.prepend(a);
        const d = document.createElement('a');
        d.href = '#';
        d.className = 'navbar-brand fca-nav fca-theme';
        d.innerHTML = '<span class="font-icon fas" aria-hidden="true"></span>';
        d.addEventListener('click', toggleDark);
        btns.prepend(d);
        $('.fab').classList.add('nm');
      }
    }

    // Dashboard「Recent Event」區塊：More 移到左邊，右邊放「Show all assignments」
    function mountRecentEvent() {
      const more = [...document.querySelectorAll('a[href="/dashboard/latestEvent"]')]
        .find(a => a.closest('.text-right'));
      const row = more && more.closest('.text-right');
      if (!row || row.querySelector('.fca-showall')) return;
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'fca-nav fca-showall';
      a.textContent = T.showAll;
      a.addEventListener('click', e => { e.preventDefault(); setOpen(true); });
      row.appendChild(a);
    }

    // ---------- 開關抽屜 ----------
    // 抽屜從網站上方那條導覽列的下緣開始，佔滿剩下的高度
    function navBottom() {
      let b = 0;
      document.querySelectorAll('#page-sysbar nav, .fs-mobile-navbar nav').forEach(n => {
        const r = n.getBoundingClientRect();
        if (r.height > 0) b = Math.max(b, r.bottom);
      });
      return Math.max(0, Math.round(b));
    }
    function syncTop() { host.style.setProperty('--top', navBottom() + 'px'); }

    let isOpen = false, prevOverflow = '';
    function setOpen(open) {
      if (open === isOpen) return;
      isOpen = open;
      if (open) {
        syncTop();
        prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden'; // 開著時背景頁面不捲動
        if (data) render(); // 重新播放卡片進場動畫
      } else {
        document.documentElement.style.overflow = prevOverflow;
      }
      host.classList.toggle('open', open);
      if (open) setTimeout(() => $('.close').focus({ preventScroll: true }), 50);
    }

    $('.fab').addEventListener('click', () => setOpen(true));
    $('.close').addEventListener('click', () => setOpen(false));
    $('.mask').addEventListener('click', () => setOpen(false));
    $('.refresh').addEventListener('click', () => refresh(true));
    $('.stats').addEventListener('click', e => {
      const b = e.target.closest('button[data-f]');
      if (b && b.dataset.f !== filter) { filter = b.dataset.f; render(); $('.list').scrollTop = 0; }
    });
    $('.search input').addEventListener('input', e => { query = e.target.value; render(); });
    $('.tools .course').addEventListener('change', e => { ui.course = e.target.value; saveUI(); render(); $('.list').scrollTop = 0; });
    $('.tools .sort').addEventListener('change', e => { ui.sort = e.target.value; saveUI(); render(); });
    $('.ics').addEventListener('click', exportIcs);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen) setOpen(false); });
    window.addEventListener('resize', () => { if (isOpen) syncTop(); });

    // 夜間模式切換：導覽列的月亮／太陽、面板標題的按鈕
    function toggleDark(e) {
      if (e) e.preventDefault();
      setDark(!document.documentElement.hasAttribute('data-fca-dark'), true);
    }
    function syncDarkUI(on) {
      host.classList.toggle('dark', on);
      const label = on ? T.light : T.dark;
      const tb = $('.theme');
      tb.innerHTML = on ? ICON.sun : ICON.moon;
      tb.title = label; tb.setAttribute('aria-label', label);
      document.querySelectorAll('.fca-theme').forEach(el => {
        const a = el.tagName === 'A' ? el : el.querySelector('a');
        a.title = label; a.setAttribute('aria-label', label);
        el.querySelector('.font-icon').className = 'font-icon fas ' + (on ? 'fa-sun' : 'fa-moon');
      });
    }
    $('.theme').addEventListener('click', () => toggleDark());
    darkHooks.push(syncDarkUI);

    // ---------- 自訂頭像（只存在這個瀏覽器，別人看不到） ----------
    const AVATAR_KEY = 'fca-avatar';
    function applyAvatar() {
      let url = null;
      try { url = localStorage.getItem(AVATAR_KEY); } catch (e) { /* ignore */ }
      document.querySelectorAll('img.fs-user-info-photo').forEach(img => {
        if (!img.dataset.fcaOrig) img.dataset.fcaOrig = img.src;
        img.src = url || img.dataset.fcaOrig;
        img.style.objectFit = 'cover';
        img.style.aspectRatio = '1';
      });
      document.querySelectorAll('.fca-av-reset').forEach(b => { b.style.display = url ? '' : 'none'; });
    }
    // 選圖片 → 跳出裁切視窗：拖曳移動、滾輪／拉桿縮放，圓框內就是頭像
    const crop = { img: null, base: 1, zoom: 1, x: 0, y: 0, size: 0 };
    function cropClamp() {
      const sc = crop.base * crop.zoom, w = crop.img.naturalWidth * sc, h = crop.img.naturalHeight * sc;
      crop.x = Math.min(0, Math.max(crop.size - w, crop.x));
      crop.y = Math.min(0, Math.max(crop.size - h, crop.y));
    }
    function cropDraw() {
      cropClamp();
      $('.stage img').style.transform = `translate(${crop.x}px,${crop.y}px) scale(${crop.base * crop.zoom})`;
    }
    function cropZoomTo(z, cx, cy) { // 以 (cx, cy) 為中心縮放
      z = Math.min(4, Math.max(1, z));
      const k = z / crop.zoom;
      crop.x = cx - (cx - crop.x) * k;
      crop.y = cy - (cy - crop.y) * k;
      crop.zoom = z;
      $('.zoom-row input').value = z;
      cropDraw();
    }
    function openCrop(src) {
      const im = $('.stage img');
      im.onload = () => {
        crop.img = im;
        $('.crop').classList.add('on');
        crop.size = $('.stage').clientWidth;
        crop.base = crop.size / Math.min(im.naturalWidth, im.naturalHeight); // 剛好蓋滿圓框
        crop.zoom = 1;
        crop.x = (crop.size - im.naturalWidth * crop.base) / 2;
        crop.y = (crop.size - im.naturalHeight * crop.base) / 2;
        $('.zoom-row input').value = 1;
        cropDraw();
        $('.crop-save').focus({ preventScroll: true });
      };
      im.src = src;
    }
    function closeCrop() { $('.crop').classList.remove('on'); $('.stage img').removeAttribute('src'); }
    function saveCrop() {
      // 縮到 256px、存成 JPEG，才不會塞爆 localStorage
      const out = 256, sc = crop.base * crop.zoom, c = document.createElement('canvas');
      c.width = c.height = out;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(crop.img, -crop.x / sc, -crop.y / sc, crop.size / sc, crop.size / sc, 0, 0, out, out);
      try { localStorage.setItem(AVATAR_KEY, c.toDataURL('image/jpeg', 0.9)); } catch (e) { alert(e); }
      closeCrop();
      applyAvatar();
    }
    (function wireCrop() {
      const stage = $('.stage');
      let drag = null;
      stage.addEventListener('pointerdown', e => {
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: crop.x, y: crop.y };
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('drag');
      });
      stage.addEventListener('pointermove', e => {
        if (!drag || e.pointerId !== drag.id) return;
        crop.x = drag.x + e.clientX - drag.sx;
        crop.y = drag.y + e.clientY - drag.sy;
        cropDraw();
      });
      const end = () => { drag = null; stage.classList.remove('drag'); };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      stage.addEventListener('wheel', e => {
        e.preventDefault();
        const r = stage.getBoundingClientRect();
        cropZoomTo(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
      }, { passive: false });
      $('.zoom-row input').addEventListener('input', e => cropZoomTo(+e.target.value, crop.size / 2, crop.size / 2));
      $('.crop-cancel').addEventListener('click', closeCrop);
      $('.crop-save').addEventListener('click', saveCrop);
      $('.crop').addEventListener('click', e => { if (e.target === $('.crop')) closeCrop(); });
      $('.crop').addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.stopPropagation(); closeCrop(); }
        if (e.key === 'Enter') saveCrop();
      });
    })();
    function pickAvatar() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => openCrop(fr.result);
        fr.readAsDataURL(f);
      };
      input.click();
    }
    function mountAvatar() {
      document.querySelectorAll('img.fs-user-info-photo').forEach(img => {
        const wrap = img.parentElement;
        if (wrap.querySelector('.fca-av')) return;
        wrap.style.position = 'relative';
        wrap.style.display = 'inline-block';
        const btnCss = 'position:absolute;width:30px;height:30px;border-radius:50%;border:2px solid #fff;' +
          'background:#2a2d34;color:#fff;cursor:pointer;display:grid;place-items:center;padding:0;font-size:13px;' +
          'opacity:0;transition:opacity .15s';
        const cam = document.createElement('button');
        cam.type = 'button';
        cam.className = 'fca-av';
        cam.title = T.avatar;
        cam.setAttribute('aria-label', T.avatar);
        cam.style.cssText = btnCss + ';right:2px;bottom:2px';
        cam.innerHTML = '<span class="fas fa-camera" aria-hidden="true"></span>';
        cam.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); pickAvatar(); });
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'fca-av fca-av-reset';
        reset.title = T.avatarReset;
        reset.setAttribute('aria-label', T.avatarReset);
        reset.style.cssText = btnCss + ';left:2px;bottom:2px';
        reset.innerHTML = '<span class="fas fa-undo" aria-hidden="true"></span>';
        reset.addEventListener('click', e => {
          e.preventDefault(); e.stopPropagation();
          try { localStorage.removeItem(AVATAR_KEY); } catch (err) { /* ignore */ }
          applyAvatar();
        });
        wrap.append(cam, reset);
        const show = v => wrap.querySelectorAll('.fca-av').forEach(b => { b.style.opacity = v; });
        wrap.addEventListener('mouseenter', () => show('1'));
        wrap.addEventListener('mouseleave', () => show('0'));
        wrap.addEventListener('focusin', () => show('1'));
        // 觸控裝置沒有滑鼠移入，點頭像就顯示按鈕
        img.addEventListener('click', () => show('1'));
      });
      applyAvatar();
    }

    // 開頁時：有快取先直接顯示；快取過期才在背景（頁面載完、空閒時）更新
    function startup() {
      let c = null;
      try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { /* ignore */ }
      if (c && c.items) { data = c; render(); checkLate(); } else skeleton();
      if (!c || Date.now() - c.time >= CACHE_MS) whenIdle(() => refresh(true));
    }

    // 登入頁不載入
    if (!location.pathname.startsWith('/index/login')) { mountNav(); mountRecentEvent(); mountAvatar(); markHomeworkList(); mountTimetable(); syncDarkUI(document.documentElement.hasAttribute('data-fca-dark')); startup(); }
    else host.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
