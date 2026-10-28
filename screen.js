/* ============ 班级小喇叭 · 教室大屏（云版） ============ */
'use strict';

const S = {
  classId: null,
  lastId: 0,
  queue: [],
  showing: null,
  autoTimer: null,
  audio: null,
  handledFinishAt: null,
  feedOpen: false,
  pollTimer: null,
};

document.addEventListener('DOMContentLoaded', () => {
  Sound.init(); TTS.init();
  $('#unlock-btn').addEventListener('click', () => { Sound.unlock().then(() => { $('#unlock-layer').style.display = 'none'; toast('大屏已就绪', true); }); });
  $('#s-full').addEventListener('click', toggleFullscreen);
  $('#s-feed-btn').addEventListener('click', () => { S.feedOpen = !S.feedOpen; $('#feed-panel').classList.toggle('show', S.feedOpen); if (S.feedOpen) renderFeedPanel(); });
  $('#s-cls').addEventListener('click', openClassPicker);
  $('#n-close').addEventListener('click', () => dismissNotice());
  $('#n-receipt').addEventListener('click', () => openReceiptGrid());
  $('#receipt-close').addEventListener('click', () => $('#receipt-overlay').classList.remove('show'));

  bootScreen();
});

/* 大屏不需要登录：没有绑定班级时，输入 6 位绑定码即可 */
async function bootScreen() {
  const uq = ClassBind.urlCode();
  if (uq) {
    try { const c = await ClassBind.resolve(uq); if (c) { ClassBind.set(c.id); localStorage.setItem('cs_screen', JSON.stringify({ classId: c.id })); } } catch (e) {}
  }
  let saved = ClassBind.get();
  try { const sc = JSON.parse(localStorage.getItem('cs_screen') || '{}'); if (sc.classId) saved = sc.classId; } catch (e) {}
  let ok = null;
  if (saved) { try { ok = await C.cls(saved); } catch (e) {} }
  if (ok) { start(); return; }
  ClassBind.ask({
    title: '教室大屏 · 绑定班级',
    hint: '输入老师给的 6 位绑定码。<br>大屏不需要登录账号，绑定一次长期有效。',
    onBound: function (c) {
      S.classId = c.id;
      localStorage.setItem('cs_screen', JSON.stringify({ classId: c.id }));
      start();
    }
  });
}

function start() {
  restoreClass().then(() => {
    Checker.start();
    startClock(d => {
      $('#s-clock').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      $('#idle-time').textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      $('#idle-date').textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 星期' + week;
      renderIdleNext();
    });
    poll(); S.pollTimer = setInterval(poll, 1200);
    if (Sound.unlocked) $('#unlock-layer').style.display = 'none';
  });
}

async function restoreClass() {
  let sc = {}; try { sc = JSON.parse(localStorage.getItem('cs_screen') || '{}'); } catch (e) {}
  const cand = sc.classId || ClassBind.get();
  if (cand && await C.cls(cand)) { S.classId = cand; }
  // 初始化 lastId 为当前最大 id，避免重放历史
  if (S.classId) { const msgs = await C.listMessages(S.classId, 50); S.lastId = msgs.length ? Math.max.apply(null, msgs.map(m => +m.id)) : 0; }
  renderClassInfo(); renderFeedPanel();
}

function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => toast('浏览器拒绝了全屏请求')); else document.exitFullscreen(); }

/* 收到信息后自动置顶+全屏 */
function bringToFront() {
  try { window.focus(); } catch (e) {}
  if (document.fullscreenEnabled && !document.fullscreenElement) { try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} }
  if (window.__csElectron && window.__csElectron.notify) { try { window.__csElectron.notify(); } catch (e) {} }
}

/* ---------- 班级 ---------- */
function renderClassInfo() {
  C.cls(S.classId).then(c => {
    $('#s-cls').textContent = c ? c.name : '未选择班级（点击选择）';
    $('#idle-cls').textContent = c ? c.name + ' · 绑定码 ' + c.code : '';
    const code = $('#s-code'); if (c) { code.hidden = false; code.textContent = '绑定码 ' + c.code; } else { code.hidden = true; }
  });
}
function openClassPicker() {
  C.listClasses().then(list => {
    openScreenModal('选择本屏展示的班级',
      (list.length ? list.map(c => '<div class="list-item" style="cursor:pointer" data-pickclass="' + c.id + '"><div class="grow" style="font-weight:600">' + esc(c.name) + '</div>' + (c.id === S.classId ? '<span class="tag-chip">当前</span>' : '<button class="btn sm ghost">使用</button>') + '</div>').join('') : '<div class="empty">还没有班级，请先在老师端创建</div>') +
      '<button class="btn ghost block mt12" data-bind-code>输入其他班级的绑定码</button>' +
      '<div class="iframe-note mt12 center">其他老师加入同一班级后，多个手机可同时向这块大屏广播。</div>');
  });
}
async function pickClass(id) {
  S.classId = id; ClassBind.set(id); localStorage.setItem('cs_screen', JSON.stringify({ classId: id }));
  S.lastId = 0; S.queue = []; dismissNotice(true);
  const msgs = await C.listMessages(id, 50); S.lastId = msgs.length ? Math.max.apply(null, msgs.map(m => +m.id)) : 0;
  renderClassInfo(); renderFeedPanel();
  toast('大屏已切换', true);
}

/* ---------- 轮询 ---------- */
async function poll() {
  if (!S.classId) { renderClassInfo(); return; }
  try {
    const msgs = await C.listMessages(S.classId, 50);
    const fresh = msgs.filter(m => +m.id > S.lastId);
    if (fresh.length) {
      S.lastId = Math.max.apply(null, msgs.map(m => +m.id));
      fresh.sort((a, b) => +a.id - +b.id);
      const liveVoice = fresh.filter(m => m.data.type === 'voice' && m.data.live);
      const others = fresh.filter(m => !(m.data.type === 'voice' && m.data.live));
      if (liveVoice.length) { S.queue = others.concat(S.queue); interruptForVoice(liveVoice[liveVoice.length - 1]); }
      else { S.queue = S.queue.concat(others); showNext(); }
      if (S.feedOpen) renderFeedPanel();
    }
    await renderTimerLayer();
    await renderRollLayer();
    renderIdleNext();
  } catch (e) { /* network */ }
}

/* ---------- 通知展示 ---------- */
function noticeFont(text, size, popup, hasImg) {
  const len = Math.max(2, String(text || '').length);
  const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
  const areaW = popup ? Math.min(vw * 0.74, 940) : vw * 0.90;
  let areaH = popup ? Math.min(vh * 0.46, 460) : vh * 0.58;
  // 图文通知：文字只占上方约四成，剩下的留给图片
  if (hasImg) areaH = Math.min(areaH * 0.42, (popup ? vh * 0.20 : vh * 0.24));
  // 二分查找「既不超过宽度、也不超过高度」的最大字号
  let lo = 14, hi = 340, best = 14;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const perLine = Math.max(1, Math.floor(areaW / (mid * 1.04)));
    const lines = Math.ceil(len / perLine);
    if (lines * mid * 1.45 <= areaH) { best = mid; lo = mid; } else { hi = mid; }
  }
  const k = { sm: 0.60, md: 0.76, lg: 0.90, xl: 1.00 }[size] || 0.76;
  return Math.round(best * k) + 'px';
}
function applyDisplayMode(d) {
  const popup = d && d.displayMode === 'popup' && d.type !== 'voice';
  $('#notice-layer').classList.toggle('popup', !!popup);
}

function showNext() {
  if (S.showing || !S.queue.length) return;
  const m = S.queue.shift(); S.showing = m;
  const d = m.data; const layer = $('#notice-layer');
  applyDisplayMode(d);
  layer.classList.add('show');
  $('#n-tag').textContent = d.tag || (d.type === 'image' ? '图片通知' : d.type === 'voice' ? (d.live ? '对讲' : '语音留言') : '班级通知');
  $('#n-who').textContent = (m.name || '') + ' · ' + fmtHM(new Date(m.created_at).getTime());
  bringToFront();
  if (d.type === 'text') {
    $('#n-body').innerHTML = '<div class="notice-text" style="font-size:' + noticeFont(d.text, d.fontSize, d.displayMode === 'popup') + '">' + esc(d.text) + '</div>';
    const afterRead = () => autoDismiss((d.displaySec == null ? 15 : d.displaySec) * 1000);
    if (Sound.unlocked && d.tts !== false) TTS.speak(d.text, d.readTimes || 1, afterRead); else afterRead();
  } else if (d.type === 'image') {
    $('#n-body').innerHTML = (d.text ? '<div class="notice-text" style="font-size:' + noticeFont(d.text, d.fontSize, d.displayMode === 'popup', true) + ';margin-bottom:2.4vh">' + esc(d.text) + '</div>' : '') + '<img class="notice-img" id="n-img">';
    Store.signedUrl(d.mediaPath).then(u => { const el = $('#n-img'); if (el && u) el.src = u; });
    const afterRead = () => autoDismiss((d.displaySec == null ? 15 : d.displaySec) * 1000);
    if (Sound.unlocked && d.text && d.tts !== false) TTS.speak(d.text, d.readTimes || 1, afterRead); else afterRead();
  } else if (d.type === 'voice') {
    $('#n-body').innerHTML = '<div class="notice-voice">' + ICON.volume + '<span class="lbl">' + esc(d.live ? (m.name || '老师') + ' 正在对讲' : '语音留言 · ' + fmtDur(d.duration || 0)) + '</span></div>';
    playNoticeVoice(m);
  }
}
function playNoticeVoice(m) {
  Store.signedUrl(m.data.mediaPath).then(url => {
    if (!url) { toast('语音加载失败'); autoDismiss(3000); return; }
    stopAudio(); const audio = new Audio(url); S.audio = audio;
    audio.onended = () => { S.audio = null; autoDismiss(1200); };
    audio.play().catch(() => { toast('请点击屏幕启用声音'); autoDismiss(8000); });
  });
}
function stopAudio() { if (S.audio) { try { S.audio.pause(); } catch (e) {} S.audio = null; } }
function autoDismiss(ms) { clearTimeout(S.autoTimer); if (!ms || ms <= 0) return; S.autoTimer = setTimeout(() => dismissNotice(), ms); }
function dismissNotice(silent) {
  clearTimeout(S.autoTimer); stopAudio(); TTS.stop();
  $('#notice-layer').classList.remove('show'); S.showing = null;
  setTimeout(showNext, 250);
}
function interruptForVoice(m) {
  clearTimeout(S.autoTimer);
  if (S.showing) { stopAudio(); TTS.stop(); $('#notice-layer').classList.remove('show'); S.showing = null; }
  S.queue = S.queue.filter(x => +x.id !== +m.id);
  S.showing = m;
  applyDisplayMode({ type: 'voice' });
  $('#notice-layer').classList.add('show');
  $('#n-tag').textContent = '对讲';
  $('#n-who').textContent = (m.name || '老师') + ' · ' + fmtHM(new Date(m.created_at).getTime());
  $('#n-body').innerHTML = '<div class="notice-voice">' + ICON.volume + '<span class="lbl">' + esc(m.name || '老师') + ' 正在对讲</span></div>';
  bringToFront();
  playNoticeVoice(m);
}

/* ---------- 收到（花名册网格） ---------- */
function openReceiptGrid() {
  const m = S.showing; if (!m) return;
  C.listStudents(S.classId).then(students => {
    if (!students.length) { C.addReceipt(m.id, S.classId, { id: 'all', name: '全班' }).then(() => toast('已记录全班收到', true)); return; }
    C.receiptsOf(m.id).then(rc => {
      const got = rc.map(r => String(r.data.student_id));
      $('#receipt-grid').innerHTML = students.map(s =>
        '<button class="' + (got.includes(String(s.id)) ? 'done' : '') + '" data-rcv="' + s.id + '" data-name="' + esc(s.name) + '" data-msg="' + m.id + '">' + esc(s.name) + '</button>'
      ).join('');
      $('#receipt-overlay').classList.add('show');
    });
  });
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-rcv]'); if (b) { await C.addReceipt(b.dataset.msg, S.classId, { id: b.dataset.rcv, name: b.dataset.name }); b.classList.add('done'); return; }
  const pc = e.target.closest('[data-pickclass]'); if (pc) { pickClass(+pc.dataset.pickclass); closeScreenModal(); return; }
  const bc = e.target.closest('[data-bind-code]');
  if (bc) {
    closeScreenModal();
    ClassBind.ask({
      title: '绑定其他班级',
      hint: '输入老师给的 6 位绑定码，绑定后这块大屏就切到该班级。',
      cancel: true,
      onBound: c => pickClass(c.id)
    });
    return;
  }
  const pb = e.target.closest('[data-play]'); if (pb) {
    Store.signedUrl(pb.dataset.play).then(url => { if (!url) return; stopAudio(); const a = new Audio(url); S.audio = a; a.onended = () => { S.audio = null; }; a.play().catch(() => toast('请先点击屏幕启用声音')); });
    return;
  }
});

function openScreenModal(title, bodyHtml) {
  let ov = $('#screen-modal');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'screen-modal'; ov.className = 'overlay center screen-modal';
    ov.innerHTML = '<div class="sheet" style="width:100%"><div class="sheet-head"><div class="t" id="sm-title"></div><button class="close" id="sm-close">✕</button></div><div id="sm-body"></div></div>';
    document.body.appendChild(ov);
    $('#sm-close').addEventListener('click', () => ov.classList.remove('show'));
    ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); });
  }
  $('#sm-title').textContent = title; $('#sm-body').innerHTML = bodyHtml; ov.classList.add('show');
}
function closeScreenModal() { const ov = $('#screen-modal'); if (ov) ov.classList.remove('show'); }

/* ---------- 通知列表 ---------- */
function renderFeedPanel() {
  if (!S.classId) { $('#feed-list').innerHTML = '<div class="iframe-note">未选择班级</div>'; return; }
  C.listMessages(S.classId, 15).then(list => {
    $('#feed-list').innerHTML = list.length ? list.map(m => {
      const d = m.data; let body = '';
      if (d.type === 'text') body = esc(d.text);
      else if (d.type === 'image') body = (d.text ? esc(d.text) + '<br>' : '') + '<img data-fmpath="' + esc(d.mediaPath) + '">';
      else body = '<button class="play-btn" data-play="' + esc(d.mediaPath) + '">' + ICON.play + '回放 ' + fmtDur(d.duration || 0) + '</button>';
      return '<div class="feed-item"><span class="tag-chip">' + esc(d.tag || (d.type === 'image' ? '图片' : d.type === 'voice' ? (d.live ? '对讲' : '语音') : '通知')) + '</span> ' + body +
        '<div class="muted2">' + esc(m.name || '') + ' · ' + fmtMDHM(new Date(m.created_at).getTime()) + '</div></div>';
    }).join('') : '<div class="iframe-note">暂无通知</div>';
    $$('[data-fmpath]').forEach(img => { Store.signedUrl(img.dataset.fmpath).then(u => { if (u) img.src = u; }); });
  });
}

/* ---------- 倒计时层 ---------- */
async function renderTimerLayer() {
  const t = await C.getTimer(S.classId);
  const rc = await C.rcLive(S.classId);
  const rollActive = !!(rc && rc.data && rc.data.rcId && (await C.getRollcall(rc.data.rcId)) && (await C.getRollcall(rc.data.rcId)).data.status === 'live');
  const layer = $('#timer-layer');
  if (!t || t.class_id !== S.classId || rollActive) { layer.classList.remove('show'); if (!t) S.handledFinishAt = null; return; }
  // 大屏负责把到点的计时器置为结束
  if (t.data.running && t.data.finishedAt == null && Date.now() >= t.data.endsAt) { await TimerC.finish(S.classId); t.data.running = false; t.data.finishedAt = Date.now(); }
  layer.classList.add('show');
  const digits = $('#timer-digits');
  if (t.data.finishedAt != null) {
    digits.textContent = '时间到'; digits.classList.add('danger'); $('#timer-label').textContent = t.data.label + ' · 结束';
    if (S.handledFinishAt !== t.data.finishedAt) { S.handledFinishAt = t.data.finishedAt; if (Sound.unlocked) { Beep.play(3); TTS.speak('时间到', 1); } bringToFront(); }
  } else {
    digits.classList.remove('danger'); $('#timer-label').textContent = t.data.label + (t.data.running ? '' : ' · 已暂停');
    digits.textContent = fmtMMSS(TimerC.remainMs(t) / 1000);
    digits.classList.toggle('danger', TimerC.remainMs(t) / 1000 <= 10 && t.data.running);
  }
}

/* ---------- 点名层 ---------- */
async function renderRollLayer() {
  const rc = await C.rcLive(S.classId);
  const layer = $('#roll-layer');
  if (!rc || !rc.data || !rc.data.rcId) { layer.classList.remove('show'); return; }
  const rec = await C.getRollcall(rc.data.rcId);
  if (!rec || rec.data.status !== 'live') { layer.classList.remove('show'); return; }
  layer.classList.add('show');
  const students = await C.listStudents(S.classId);
  const cur = students.find(s => s.id === rec.data.order[rec.data.idx]);
  $('#roll-name').textContent = cur ? cur.name : '--';
  const got = Object.values(rec.data.results || {}).filter(v => v === 'present').length;
  const absent = Object.values(rec.data.results || {}).filter(v => v === 'absent').length;
  let extra = '';
  if (rec.data.perSec) { const left = Math.max(0, Math.ceil((rec.data.curStart + rec.data.perSec * 1000 - Date.now()) / 1000)); extra = ' · 本环节 ' + fmtMMSS(left); }
  $('#roll-count').textContent = '第 ' + (rec.data.idx + 1) + ' / ' + rec.data.order.length + ' 人 · 已到 ' + got + ' · 缺勤 ' + absent + extra;
}

/* ---------- 待机层：下一个定时 ---------- */
function renderIdleNext() {
  const chip = $('#idle-next');
  if (!S.classId || S.showing) { chip.hidden = true; return; }
  C.listSchedules(S.classId).then(list => {
    const now = new Date(); const day = now.getDay();
    const hmNow = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    const cand = list.filter(r => r.data.enabled).filter(r => {
      if (r.data.time <= hmNow) return false;
      if (r.data.repeat === 'weekdays' && (day === 0 || day === 6)) return false;
      if (r.data.repeat === 'custom' && !(r.data.days || []).includes(day)) return false;
      if (r.data.repeat === 'once' && r.data.fireDate && r.data.fireDate !== todayKey()) return false;
      return true;
    }).sort((a, b) => (a.data.time || '').localeCompare(b.data.time || ''));
    if (cand.length) { chip.hidden = false; chip.textContent = '下一个：' + cand[0].name + ' · ' + cand[0].data.time; } else chip.hidden = true;
  });
}
