// ==UserScript==
// @name         STUST Flipclass Assistant
// @namespace    https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @version      1.10.0
// @description  FlipClass assignment overview: submitted / to do / overdue across all courses (follows the site language)
// @author       Creeperlol
// @license      MIT
// @match        https://flipclass.stust.edu.tw/*
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
${D} :is(img:not(.fs-logo),.img-container,.fs-banner){filter:brightness(.88)}
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
@media (max-width:1599px){.fca-about{display:none!important}}`;
  (document.head || document.documentElement).appendChild(darkBase);

  // 顏色換算（HSL）
  let colorCtx = null;
  function parseColor(v) {
    v = (v || '').trim();
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
    return hsla(215, l < 0.3 ? 0.6 : 0.08, nl, c[3]);
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
  function darkDecl(style, forceImportant) {
    let out = '';
    for (const [prop, fn] of MAPS) {
      const c = parseColor(style.getPropertyValue(prop));
      const v = c && fn(c);
      if (v) out += `${prop}:${v}${forceImportant || style.getPropertyPriority(prop) ? '!important' : ''};`;
    }
    // 淺色漸層背景直接換成單色
    const bi = style.getPropertyValue('background-image');
    if (bi && bi.includes('gradient')) {
      const cols = (bi.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|\b[a-z]+\b(?=\s*[,)\s]))/gi) || []).map(parseColor).filter(Boolean);
      if (cols.length && cols.every(c => toHsl(c)[2] >= 0.55)) {
        out += `background-image:none!important;background-color:${mapBg(cols[0])}!important;`;
      }
    }
    return out;
  }
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
        const d = darkDecl(r.style, false);
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
  let inlineSeq = 0;
  function darkInlineFor(root) {
    let css = '';
    const els = root.nodeType === 1 && root.hasAttribute('style') ? [root] : [];
    if (root.querySelectorAll) els.push(...root.querySelectorAll('[style]'));
    for (const el of els) {
      if (el.closest('#fca-host')) continue;
      const d = darkDecl(el.style, true);
      if (!d) continue;
      if (!el.dataset.fcaI) el.dataset.fcaI = ++inlineSeq;
      css += `${D} [data-fca-i="${el.dataset.fcaI}"]{${d}}\n`;
    }
    if (css) darkInline.textContent += css;
  }
  const builtSheets = new Set();
  function buildDark() {
    let css = '', changed = false;
    for (const sh of document.styleSheets) {
      if (sh.ownerNode === darkBase || sh.ownerNode === darkDyn || sh.ownerNode === darkInline) continue;
      let rules;
      try { rules = sh.cssRules; } catch (e) { continue; } // 跨網域的 CSS 讀不到就跳過
      if (!builtSheets.has(sh)) { builtSheets.add(sh); changed = true; }
      css += walkRules(rules);
    }
    if (changed || !darkDyn.isConnected) {
      darkDyn.textContent = css;
      document.head.append(darkDyn, darkInline);
    }
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
    if (on) ensureDark();
    if (save) { try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }
    darkHooks.forEach(f => f(on));
  }
  setDark(darkPref(), false);
  // 萬一出錯也不要讓頁面一直隱藏
  setTimeout(() => document.documentElement.setAttribute('data-fca-ready', ''), 2500);

  function main() {
    if (document.documentElement.hasAttribute('data-fca-dark')) ensureDark();
    const REPO = 'https://github.com/Creeperlol/STUST-Flipclass-Assistant';
    let VERSION = '1.10.0';
    try { VERSION = GM_info.script.version; } catch (e) {
      try { VERSION = chrome.runtime.getManifest().version; } catch (e2) { /* bookmarklet */ }
    }

    const CACHE_KEY = 'fca-cache-v1';
    const CACHE_MS = 10 * 60 * 1000; // 10 分鐘內換頁不重抓

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
      const { doc, url } = await fetchDoc('/dashboard');
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
      const lists = await Promise.all(courses.map(c => getHomework(c, now).catch(() => [])));
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
        fab: 'Assignments', showAll: 'Show all assignments', title: 'Assignments', refresh: 'Refresh', close: 'Close', dark: 'Dark mode', light: 'Light mode', avatar: 'Change photo', avatarReset: 'Reset photo', crop: 'Adjust photo', cropHint: 'Drag to move · scroll or slide to zoom', save: 'Save', cancel: 'Cancel', zoom: 'Zoom',
        todo: 'To do', missed: 'Overdue', done: 'Submitted', all: 'All',
        updated: (t, n) => `Updated ${t} · ${n} total`,
        left: (d, h) => d > 0 ? `${d}d ${h}h left` : `${h}h left`,
        search: 'Search assignments or courses', loading: 'Loading…', empty: 'Nothing here 🎉',
        noMatch: 'No matching assignments', error: 'Failed to load. Tap refresh to try again.',
      },
      'zh-TW': {
        fab: '作業', showAll: '所有作業', title: '作業總覽', refresh: '重新整理', close: '關閉', dark: '夜間模式', light: '日間模式', avatar: '更換頭像', avatarReset: '還原頭像', crop: '調整頭像', cropHint: '拖曳移動位置・滾輪或拉桿縮放', save: '儲存', cancel: '取消', zoom: '縮放',
        todo: '進行中', missed: '已過期', done: '已繳交', all: '全部',
        updated: (t, n) => `更新於 ${t}・共 ${n} 份`,
        left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小時` : `剩 ${h} 小時`,
        search: '搜尋作業或課程', loading: '載入中…', empty: '這裡沒有作業 🎉',
        noMatch: '找不到符合的作業', error: '讀取失敗，請按重新整理再試一次',
      },
      'zh-CN': {
        fab: '作业', showAll: '所有作业', title: '作业总览', refresh: '刷新', close: '关闭', dark: '夜间模式', light: '日间模式', avatar: '更换头像', avatarReset: '还原头像', crop: '调整头像', cropHint: '拖动移动位置・滚轮或拉杆缩放', save: '保存', cancel: '取消', zoom: '缩放',
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

  /* 清單 */
  .list{flex:1;overflow:auto;padding:8px 22px 28px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;
    scrollbar-width:thin;scrollbar-color:var(--line2) transparent}
  .item{position:relative;display:block;text-decoration:none;color:inherit;background:var(--panel);border-radius:0;
    padding:12px 14px 12px 18px;margin-top:8px;border:1px solid transparent;
    clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%);
    transition:background .15s,border-color .15s;animation:rise .3s ease both}
  .item::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--c)}
  .item.todo{--c:var(--todo)}.item.missed{--c:var(--missed)}.item.done{--c:var(--done)}
  .item:hover{background:var(--panel2)}
  @keyframes rise{from{opacity:0}to{opacity:1}}
  .top-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .idx{font-size:12px;color:var(--dim);letter-spacing:1px}
  .tag{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:0;white-space:nowrap;background:var(--c);color:#111}
  .item.done .tag{background:transparent;color:var(--c);box-shadow:inset 0 0 0 1px var(--c)}
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
      <div class="hd-row"><div class="ttl"><div class="code">ASSIGNMENT / STUST FLIPCLASS</div><h2>${T.title}</h2></div>
        <button class="icon-btn theme"></button>
        <button class="icon-btn refresh" title="${T.refresh}" aria-label="${T.refresh}">${ICON.refresh}</button>
        <button class="icon-btn close" title="${T.close}" aria-label="${T.close}">${ICON.close}</button></div>
      <div class="meta"></div>
    </div>
    <div class="stats"></div>
    <label class="search">${ICON.search}<input type="search" placeholder="${T.search}" aria-label="${T.search}"></label>
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
      const n = { todo: 0, missed: 0, done: 0, all: items.length };
      items.forEach(h => n[h.st]++);

      const badge = $('.fab .b');
      badge.textContent = n.todo;
      badge.classList.toggle('ok', n.todo === 0);
      document.querySelectorAll('.fca-nav-badge').forEach(b => { b.textContent = `(${n.todo})`; });

      $('.meta').textContent = T.updated(fmt(data.time), items.length);
      $('.stats').innerHTML = ['todo', 'missed', 'done', 'all'].map(k =>
        `<button class="stat ${k}${k === filter ? ' on' : ''}" data-f="${k}" aria-pressed="${k === filter}">
           <div class="n">${n[k]}</div><div class="l">${T[k]}</div></button>`).join('');

      const q = query.trim().toLowerCase();
      const shown = items
        .filter(h => filter === 'all' || h.st === filter)
        .filter(h => !q || (h.title + ' ' + h.course).toLowerCase().includes(q))
        .sort((a, b) => {
          if (ORDER[a.st] !== ORDER[b.st]) return ORDER[a.st] - ORDER[b.st];
          const da = a.deadline ?? Infinity, db = b.deadline ?? Infinity;
          return a.st === 'todo' ? da - db : db - da;
        });

      $('.list').innerHTML = shown.length ? shown.map((h, i) => {
        const left = h.st === 'todo' && h.deadline ? leftInfo(h.deadline, now) : null;
        const score = h.st === 'done' && h.score && h.score !== '-' ? `<span class="score">${esc(h.score)}</span>` : '';
        return `
        <a class="item ${h.st}" href="${esc(h.href)}" style="animation-delay:${Math.min(i, 12) * 28}ms">
          <div class="top-row"><span class="idx">${String(i + 1).padStart(2, '0')}</span><span class="tag">${TG[h.st]}</span>
            ${left ? `<span class="left ${left.cls}">${left.text}</span>` : score}</div>
          <div class="title">${esc(h.title)}</div>
          <div class="sub"><span>${ICON.cal}${h.deadline ? fmt(h.deadline) : esc(h.termText)}</span>
            <span>${ICON.book}${esc(h.course)}</span></div>
        </a>`;
      }).join('') : `<div class="msg">${q ? T.noMatch : T.empty}</div>`;
    }

    async function refresh(force) {
      const btn = $('.refresh');
      btn.classList.add('spin');
      if (!data || force) skeleton();
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

    // 登入頁不載入
    if (!location.pathname.startsWith('/index/login')) { mountNav(); mountRecentEvent(); mountAvatar(); syncDarkUI(document.documentElement.hasAttribute('data-fca-dark')); skeleton(); refresh(false); }
    else host.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
