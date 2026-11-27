// ==UserScript==
// @name         STUST Flipclass Assistant
// @namespace    https://github.com/Creeperlol/STUST-Flipclass-Assistant
// @version      1.1.0
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
      fab: 'Assignments', title: 'Assignment Overview', refresh: 'Refresh', close: 'Close',
      todo: 'To do', missed: 'Overdue', done: 'Submitted', all: 'All assignments',
      updated: (t, n) => `Updated ${t} · ${n} total`,
      left: (d, h) => d > 0 ? `${d}d ${h}h left` : `${h}h left`,
      loading: 'Loading…', empty: 'Nothing here 🎉', error: 'Failed to load. Tap “Refresh” to try again.',
    },
    'zh-TW': {
      fab: '作業', title: '作業總覽', refresh: '重新整理', close: '關閉',
      todo: '未繳・進行中', missed: '未繳・已過期', done: '已繳交', all: '所有作業',
      updated: (t, n) => `更新於 ${t}・共 ${n} 份`,
      left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小時` : `剩 ${h} 小時`,
      loading: '載入中…', empty: '這裡沒有作業 🎉', error: '讀取失敗，請按「重新整理」再試一次',
    },
    'zh-CN': {
      fab: '作业', title: '作业总览', refresh: '刷新', close: '关闭',
      todo: '未缴・进行中', missed: '未缴・已过期', done: '已缴交', all: '所有作业',
      updated: (t, n) => `更新于 ${t}・共 ${n} 份`,
      left: (d, h) => d > 0 ? `剩 ${d} 天 ${h} 小时` : `剩 ${h} 小时`,
      loading: '加载中…', empty: '这里没有作业 🎉', error: '读取失败，请按“刷新”再试一次',
    },
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
  const T = I18N[detectLang()];

  const ORDER = { todo: 0, missed: 1, done: 2 };

  // ---------- 介面（Shadow DOM，不受網站 CSS 影響） ----------
  const host = document.createElement('div');
  host.id = 'fca-host';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,"Microsoft JhengHei","Noto Sans TC",sans-serif}
.fab{position:fixed;right:16px;bottom:16px;z-index:2147483646;border:0;border-radius:28px;
  background:#1a5fb4;color:#fff;padding:12px 16px;font-size:15px;font-weight:600;
  box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;display:flex;gap:8px;align-items:center}
.fab .b{background:#fff;color:#b3261e;border-radius:10px;padding:0 7px;font-size:13px;min-width:20px;text-align:center}
.fab .b.ok{color:#1b7a2f}
.mask{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:2147483646;display:none}
.panel{position:fixed;z-index:2147483647;right:16px;bottom:76px;width:min(560px,calc(100vw - 32px));
  max-height:min(75vh,720px);background:#fff;color:#222;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);
  display:none;flex-direction:column;overflow:hidden}
.open .panel{display:flex} .open .mask{display:block}
.hd{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eee}
.hd h2{font-size:16px;margin:0;flex:1}
.hd button{border:0;background:#f0f2f5;border-radius:8px;padding:6px 10px;font-size:14px;cursor:pointer;color:#222}
.meta{font-size:12px;color:#666;padding:6px 14px 0}
.filters{display:flex;gap:6px;flex-wrap:wrap;padding:8px 14px}
.filters button{border:1px solid #ccc;background:#fff;border-radius:16px;padding:6px 10px;font-size:13px;cursor:pointer;color:#222}
.filters button.on{background:#222;color:#fff;border-color:#222}
.list{overflow:auto;padding:0 8px 8px;-webkit-overflow-scrolling:touch}
.item{display:block;text-decoration:none;color:inherit;padding:10px 8px;border-bottom:1px solid #f0f0f0;border-radius:6px}
.item:hover{background:#f7f9fc}
.row1{display:flex;gap:8px;align-items:center;font-size:12px;color:#666}
.tag{padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap}
.tag.done{background:#e3f5e6;color:#1b7a2f}.tag.todo{background:#fff1d6;color:#9a5b00}.tag.missed{background:#fde2e2;color:#b3261e}
.left{color:#c25700;font-weight:600}
.title{font-size:14px;margin-top:4px;line-height:1.4}
.item.done .title{color:#777}
.course{font-size:12px;color:#888;margin-top:2px}
.msg{padding:24px 14px;text-align:center;color:#666;font-size:14px}
@media (max-width:600px){
  .panel{right:0;left:0;bottom:0;width:100%;max-height:85vh;border-radius:14px 14px 0 0}
  .fab{right:12px;bottom:12px}
  .open .fab{display:none}
}
</style>
<div class="mask"></div>
<button class="fab" title="${T.title}">${T.fab} <span class="b">…</span></button>
<div class="panel" role="dialog" aria-label="${T.title}">
  <div class="hd"><h2>${T.title}</h2><button class="refresh">${T.refresh}</button><button class="close" aria-label="${T.close}">✕</button></div>
  <div class="meta"></div>
  <div class="filters"></div>
  <div class="list"><div class="msg">${T.loading}</div></div>
</div>`;

  const $ = s => root.querySelector(s);
  let data = null, filter = 'todo';

  function fmt(ts) {
    const d = new Date(ts), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function leftText(ts, now) {
    const ms = ts - now, h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
    return T.left(d, h % 24);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function render() {
    const now = Date.now();
    if (!data) return;
    const items = data.items.map(h => ({ ...h, st: statusOf(h, now) }));
    const n = { todo: 0, missed: 0, done: 0 };
    items.forEach(h => n[h.st]++);

    const badge = $('.fab .b');
    badge.textContent = n.todo;
    badge.classList.toggle('ok', n.todo === 0);

    $(".meta").textContent = T.updated(fmt(data.time), items.length);
    $('.filters').innerHTML = ['todo', 'missed', 'done', 'all'].map(k =>
      `<button data-f="${k}" class="${k === filter ? 'on' : ''}">${T[k]} ${k === 'all' ? items.length : n[k]}</button>`).join('');

    const shown = items.filter(h => filter === 'all' || h.st === filter).sort((a, b) => {
      if (ORDER[a.st] !== ORDER[b.st]) return ORDER[a.st] - ORDER[b.st];
      const da = a.deadline ?? Infinity, db = b.deadline ?? Infinity;
      return a.st === 'todo' ? da - db : db - da;
    });
    $('.list').innerHTML = shown.length ? shown.map(h => `
      <a class="item ${h.st}" href="${esc(h.href)}">
        <div class="row1"><span class="tag ${h.st}">${T[h.st]}</span>
          <span>${h.deadline ? fmt(h.deadline) : esc(h.termText)}</span>
          ${h.st === 'todo' && h.deadline ? `<span class="left">${leftText(h.deadline, now)}</span>` : ''}</div>
        <div class="title">${esc(h.title)}</div>
        <div class="course">${esc(h.course)}${h.score && h.score !== '-' ? '・' + esc(h.score) : ''}</div>
      </a>`).join('') : `<div class="msg">${T.empty}</div>`;
  }

  async function refresh(force) {
    $('.list').innerHTML = `<div class="msg">${T.loading}</div>`;
    try {
      data = await loadAll(force);
    } catch (e) {
      $('.list').innerHTML = `<div class="msg">${T.error}</div>`;
      return;
    }
    if (!data) { host.remove(); return; } // 沒登入就不顯示
    render();
  }

  function setOpen(open) {
    root.host.classList.toggle('open', open);
    $('.panel').style.display = open ? 'flex' : '';
    $('.mask').style.display = open ? 'block' : '';
    if (window.matchMedia('(max-width:600px)').matches) $('.fab').style.display = open ? 'none' : '';
  }

  $('.fab').addEventListener('click', () => setOpen(true));
  $('.close').addEventListener('click', () => setOpen(false));
  $('.mask').addEventListener('click', () => setOpen(false));
  $('.refresh').addEventListener('click', () => refresh(true));
  $('.filters').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]');
    if (b) { filter = b.dataset.f; render(); }
  });

  // 登入頁不載入
  if (!location.pathname.startsWith('/index/login')) refresh(false);
  else host.remove();
})();
