// ==UserScript==
// @name         STUST Flipclass Assistant
// @namespace    https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @version      1.8.2
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

  // ---------- 夜間模式（document-start 就套用，避免白色閃一下） ----------
  // 整頁反轉顏色，圖片、影片、橫幅和網站深色導覽列（電腦版、手機版）再反轉回來保持原色。
  const DARK_KEY = 'fca-dark';
  const FLIP = 'invert(1) hue-rotate(180deg)';
  const darkStyle = document.createElement('style');
  darkStyle.id = 'fca-dark-style';
  darkStyle.textContent = `
html[data-fca-dark]{filter:invert(.9) hue-rotate(180deg) contrast(1.15);background:#fff}
html[data-fca-dark] :is(img,video,picture,canvas,iframe,embed,object,.fs-banner,.img-container,[style*="background-image"],:is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar)){filter:${FLIP}}
html[data-fca-dark] :is(.fs-banner,.img-container,[style*="background-image"],:is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar)) :is(img,video,picture,canvas){filter:none}
html[data-fca-dark] :is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar){position:relative;z-index:1030;
  background:#1c1d21!important;border-color:#1c1d21!important;box-shadow:inset 0 -2px 0 #ffd23c}
html[data-fca-dark] :is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar) .navbar-nav>li>a:is(:hover,:focus),
html[data-fca-dark] :is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar) .navbar-nav>.open>a{background:#2a2c31!important;outline:none}
html[data-fca-dark] :is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar) :is(.dropdown-menu,.navbar-collapse.in,.navbar-collapse.collapsing){filter:${FLIP}}
html[data-fca-dark] :is(nav.fs-sysbar,.fs-mobile-navbar nav.navbar) :is(.dropdown-menu,.navbar-collapse.in,.navbar-collapse.collapsing) :is(img,video){filter:none}`;
  (document.head || document.documentElement).appendChild(darkStyle);
  function darkPref() {
    try { const v = localStorage.getItem(DARK_KEY); if (v !== null) return v === '1'; } catch (e) { /* ignore */ }
    return matchMedia('(prefers-color-scheme: dark)').matches;
  }
  const darkHooks = [];
  function setDark(on, save) {
    document.documentElement.toggleAttribute('data-fca-dark', on);
    if (save) { try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ } }
    darkHooks.forEach(f => f(on));
  }
  setDark(darkPref(), false);

  function main() {

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
        fab: 'Assignments', showAll: 'Show all assignments', title: 'Assignments', refresh: 'Refresh', close: 'Close', dark: 'Dark mode', light: 'Light mode',
        todo: 'To do', missed: 'Overdue', done: 'Submitted', all: 'All',
        updated: (t, n) => `Updated ${t} · ${n} total`,
        left: (d, h) => d > 0 ? `${d}d ${h}h left` : `${h}h left`,
        search: 'Search assignments or courses', loading: 'Loading…', empty: 'Nothing here 🎉',
        noMatch: 'No matching assignments', error: 'Failed to load. Tap refresh to try again.',
      },
      'zh-TW': {
        fab: '作業', showAll: '所有作業', title: '作業總覽', refresh: '重新整理', close: '關閉', dark: '夜間模式', light: '日間模式',
        todo: '進行中', missed: '已過期', done: '已繳交', all: '全部',
        updated: (t, n) => `更新於 ${t}・共 ${n} 份`,
        left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小時` : `剩 ${h} 小時`,
        search: '搜尋作業或課程', loading: '載入中…', empty: '這裡沒有作業 🎉',
        noMatch: '找不到符合的作業', error: '讀取失敗，請按重新整理再試一次',
      },
      'zh-CN': {
        fab: '作业', showAll: '所有作业', title: '作业总览', refresh: '刷新', close: '关闭', dark: '夜间模式', light: '日间模式',
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
  :host(.dark) :is(.drawer,.mask,.fab){filter:invert(1) hue-rotate(180deg)}
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
  </aside>`;

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

    // 登入頁不載入
    if (!location.pathname.startsWith('/index/login')) { mountNav(); mountRecentEvent(); syncDarkUI(document.documentElement.hasAttribute('data-fca-dark')); skeleton(); refresh(false); }
    else host.remove();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
  else main();
})();
