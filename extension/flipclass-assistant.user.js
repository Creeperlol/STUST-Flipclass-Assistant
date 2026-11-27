// ==UserScript==
// @name         STUST Flipclass Assistant
// @namespace    https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @version      1.6.1
// @description  FlipClass assignment overview: submitted / to do / overdue across all courses (follows the site language)
// @author       Creeperlol
// @license      MIT
// @match        https://flipclass.stust.edu.tw/*
// @run-at       document-idle
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
      fab: 'Assignments', showAll: 'Show all assignments', title: 'Assignments', refresh: 'Refresh', close: 'Close',
      todo: 'To do', missed: 'Overdue', done: 'Submitted', all: 'All',
      updated: (t, n) => `Updated ${t} · ${n} total`,
      left: (d, h) => d > 0 ? `${d}d ${h}h left` : `${h}h left`,
      search: 'Search assignments or courses', loading: 'Loading…', empty: 'Nothing here 🎉',
      noMatch: 'No matching assignments', error: 'Failed to load. Tap refresh to try again.',
    },
    'zh-TW': {
      fab: '作業', showAll: '所有作業', title: '作業總覽', refresh: '重新整理', close: '關閉',
      todo: '進行中', missed: '已過期', done: '已繳交', all: '全部',
      updated: (t, n) => `更新於 ${t}・共 ${n} 份`,
      left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小時` : `剩 ${h} 小時`,
      search: '搜尋作業或課程', loading: '載入中…', empty: '這裡沒有作業 🎉',
      noMatch: '找不到符合的作業', error: '讀取失敗，請按重新整理再試一次',
    },
    'zh-CN': {
      fab: '作业', showAll: '所有作业', title: '作业总览', refresh: '刷新', close: '关闭',
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
  --blue:#4c5fd5;--blue-bg:#eef0fc;--ink:#22252b;--sub:#6b7079;--line:#e6e4df;--bg:#f6f5f2;--hd:#2a2d34;
  --todo:#c27a12;--todo-bg:#fbf3e3;--missed:#c8423a;--missed-bg:#fbecea;--done:#2f8a5b;--done-bg:#e7f4ec}
*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI","Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif}
button{font:inherit;color:inherit}

/* 浮動按鈕（只在沒有網站導覽列時出現） */
.fab{position:fixed;right:16px;bottom:16px;z-index:2147483645;border:0;border-radius:6px;
  background:var(--blue);color:#fff;padding:12px 16px;font-size:15px;font-weight:600;
  cursor:pointer;display:flex;gap:8px;align-items:center;transition:background .15s}
.fab:hover{background:#3d4fc0}
.fab .b{background:#fff;color:var(--missed);border-radius:4px;padding:0 7px;font-size:13px;min-width:20px;text-align:center}
.fab .b.ok{color:var(--done)}
@media (min-width:992px){.fab.nd{display:none}}
@media (max-width:991px){.fab.nm{display:none}}

/* 背景遮罩 */
.mask{position:fixed;left:0;right:0;bottom:0;top:var(--top);z-index:2147483646;
  background:rgba(15,23,42,.38);opacity:0;pointer-events:none;transition:opacity .35s var(--ease)}
:host(.open) .mask{opacity:1;pointer-events:auto}

/* 右側抽屜 */
.drawer{position:fixed;right:0;bottom:0;top:var(--top);z-index:2147483647;width:min(640px,100vw);
  background:var(--bg);color:var(--ink);display:flex;flex-direction:column;
  border-left:1px solid var(--line);transform:translateX(104%);visibility:hidden;
  transition:transform .42s var(--ease),visibility 0s linear .42s}
:host(.open) .drawer{transform:none;visibility:visible;transition:transform .42s var(--ease),visibility 0s}

.hd{background:var(--hd);color:#fff;padding:18px 20px 16px;flex:none}
.hd-row{display:flex;align-items:center;gap:8px}
.hd h2{margin:0;font-size:20px;font-weight:700;flex:1;letter-spacing:.3px}
.icon-btn{border:0;background:rgba(255,255,255,.1);color:#fff;width:36px;height:36px;border-radius:6px;
  display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .2s var(--ease)}
.icon-btn:hover{background:rgba(255,255,255,.2)}
.icon-btn:active{background:rgba(255,255,255,.28)}
.icon-btn.spin svg{animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.meta{font-size:12.5px;opacity:.65;margin-top:4px;min-height:16px}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 20px 4px;margin-top:-2px;flex:none}
.stat{border:1px solid var(--line);background:#fff;border-radius:6px;padding:10px 12px;text-align:left;cursor:pointer;
  transition:border-color .15s,background .15s}
.stat:hover{background:#faf9f7;border-color:#d6d3cc}
.stat .n{font-size:24px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.stat .l{font-size:12.5px;color:var(--sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat.todo .n{color:var(--todo)}.stat.missed .n{color:var(--missed)}.stat.done .n{color:var(--done)}.stat.all .n{color:var(--blue)}
.stat.on.todo{border-color:var(--todo);background:var(--todo-bg)}
.stat.on.missed{border-color:var(--missed);background:var(--missed-bg)}
.stat.on.done{border-color:var(--done);background:var(--done-bg)}
.stat.on.all{border-color:var(--blue);background:var(--blue-bg)}

.search{margin:10px 20px 6px;position:relative;flex:none}
.search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#8a93a3}
.search input{width:100%;border:1px solid var(--line);background:#fff;border-radius:6px;padding:10px 12px 10px 36px;
  font-size:14px;color:var(--ink);outline:none;transition:border-color .15s}
.search input:focus{border-color:var(--blue)}

.list{flex:1;overflow:auto;padding:6px 20px 24px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.item{position:relative;display:block;text-decoration:none;color:inherit;background:#fff;border-radius:6px;
  padding:12px 14px 12px 18px;margin-top:8px;border:1px solid var(--line);overflow:hidden;
  transition:background .15s,border-color .15s;animation:rise .3s ease both}
.item::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}
.item.todo{--c:var(--todo)}.item.missed{--c:var(--missed)}.item.done{--c:var(--done)}
.item:hover{background:#faf9f7;border-color:#d6d3cc}
@keyframes rise{from{opacity:0}to{opacity:1}}
.top-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tag{font-size:12px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap}
.todo .tag{color:var(--todo);background:var(--todo-bg)}.missed .tag{color:var(--missed);background:var(--missed-bg)}.done .tag{color:var(--done);background:var(--done-bg)}
.left{margin-left:auto;font-size:12.5px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap;color:var(--blue);background:var(--blue-bg)}
.left.soon{color:var(--todo);background:var(--todo-bg)}
.left.urgent{color:var(--missed);background:var(--missed-bg)}
.score{margin-left:auto;font-size:12.5px;color:var(--sub)}
.title{font-size:15px;font-weight:600;line-height:1.45;margin-top:7px;color:var(--ink)}
.item.done .title{color:var(--sub);font-weight:500}
.sub{display:flex;gap:14px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--sub)}
.sub span{display:inline-flex;align-items:center;gap:5px;min-width:0}
.msg{padding:48px 14px;text-align:center;color:var(--sub);font-size:14px;animation:rise .4s var(--ease) both}
.skel{height:86px;border-radius:6px;margin-top:8px;background:linear-gradient(90deg,#ebe9e4 25%,#f4f3ef 50%,#ebe9e4 75%);
  background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}

@media (max-width:600px){
  .hd{padding:14px 16px 12px}.stats{padding:12px 16px 2px;gap:8px}.search{margin:8px 16px 4px}.list{padding:4px 16px 20px}
  .stat{padding:8px 9px}.stat .n{font-size:20px}.stat .l{font-size:11.5px}
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
    <div class="hd-row"><h2>${T.title}</h2>
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
        <div class="top-row"><span class="tag">${TG[h.st]}</span>
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

  // 登入頁不載入
  if (!location.pathname.startsWith('/index/login')) { mountNav(); mountRecentEvent(); skeleton(); refresh(false); }
  else host.remove();
})();
