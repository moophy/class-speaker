/* ============ 班级小喇叭 · 教室大屏（云版） ============ */
'use strict';

const S = {
  classId: null,
  lastId: 0,
  queue: [],
  showing: null,
  receipted: null,
  autoTimer: null,
  marqueeTimer: null,
  audio: null,
  handledFinishAt: null,
  feedOpen: false,
  pollTimer: null,
};

document.addEventListener('DOMContentLoaded', () => {
  Sound.init(); TTS.init();
  $('#unlock-btn').addEventListener('click', () => {
    const layer = $('#unlock-layer');
    if (layer) layer.style.display = 'none';        // 先关掉遮罩，声音在后台解锁
    Sound.unlock().then(() => toast('大屏已就绪', true)).catch(() => {});
  });
  $('#s-full').addEventListener('click', toggleFullscreen);
  $('#s-draw').addEventListener('click', drawOpen);
  $('#s-feed-btn').addEventListener('click', () => { S.feedOpen = !S.feedOpen; $('#feed-panel').classList.toggle('show', S.feedOpen); if (S.feedOpen) renderFeedPanel(); });
  $('#s-cls').addEventListener('click', openClassPicker);
  $('#n-close').addEventListener('click', () => dismissNotice());
  $('#n-receipt').addEventListener('click', () => markReceived());

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
    presencePing(); setInterval(presencePing, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) presencePing(); });
    window.addEventListener('pagehide', presenceOffline);
    window.addEventListener('beforeunload', presenceOffline);
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

/* 在线心跳：老师端据此在班级胶囊上显示「在线 / 离线」。
   心跳 8 秒一次；关窗口时用 keepalive 直接写离线（写不出去就等 24 秒超时）。 */
function presencePing() {
  if (!S.classId) return;
  C.setPresence(S.classId, { screen: Date.now() }).then(id => { if (id) S.prow = id; }).catch(() => {});
}

function presenceOffline() {
  if (!S.classId) return;
  C.offlinePresence(S.classId, S.prow);
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
  renderClassInfo(); renderFeedPanel(); presencePing();
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
    await syncDraw();
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
  const layer = $('#notice-layer');
  const type = d && d.type;
  // 图片通知：一律铺满整屏放大显示，不再用弹窗
  if (type === 'image') { layer.classList.remove('popup'); layer.classList.add('imgfull'); return; }
  layer.classList.remove('imgfull');
  const popup = d && d.displayMode === 'popup' && type !== 'voice';
  layer.classList.toggle('popup', !!popup);
}

function showNext() {
  if (S.showing || !S.queue.length) return;
  const m = S.queue.shift(); S.showing = m;
  const d = m.data; const layer = $('#notice-layer');
  // 跑马灯：不占整屏，只在底部横向滚动
  if (d.displayMode === 'marquee' && d.type === 'text') { showMarquee(m); return; }
  applyDisplayMode(d);
  layer.classList.add('show');
  $('#n-tag').textContent = d.tag || (d.type === 'image' ? '图片通知' : d.type === 'voice' ? (d.live ? '对讲' : '语音留言') : '班级通知');
  $('#n-who').textContent = m.name || '老师';
  $('#n-time').textContent = '· ' + fmtHM(new Date(m.created_at).getTime());
  S.receipted = null; resetReceiptBtn(m);
  bringToFront();
  if (d.type === 'text') {
    $('#n-body').innerHTML = '<div class="notice-text" style="font-size:' + noticeFont(d.text, d.fontSize, d.displayMode === 'popup') + '">' + esc(d.text) + '</div>';
    const afterRead = () => autoDismiss((d.displaySec == null ? 15 : d.displaySec) * 1000);
    if (Sound.unlocked && d.tts !== false) TTS.speak(d.text, d.readTimes || 1, afterRead); else afterRead();
  } else if (d.type === 'image') {
    $('#n-body').innerHTML = '<img class="notice-img" id="n-img">' +
      (d.text ? '<div class="notice-cap" style="font-size:' + noticeFont(d.text, d.fontSize, true, true) + '">' + esc(d.text) + '</div>' : '');
    Store.signedUrl(d.mediaPath).then(u => { const el = $('#n-img'); if (el && u) el.src = u; });
    const afterRead = () => autoDismiss((d.displaySec == null ? 15 : d.displaySec) * 1000);
    if (Sound.unlocked && d.text && d.tts !== false) TTS.speak(d.text, d.readTimes || 1, afterRead); else afterRead();
  } else if (d.type === 'voice') {
    $('#n-body').innerHTML = '<div class="notice-voice">' + ICON.volume + '<span class="lbl">' + esc(d.live ? (m.name || '老师') + ' 正在对讲' : '语音留言 · ' + fmtDur(d.duration || 0)) + '</span></div>';
    playNoticeVoice(m);
  }
}

/* 语音：按「播放次数」重复播完再收起（对讲只播一遍） */
function playNoticeVoice(m) {
  const d = m.data || {};
  const times = d.live ? 1 : Math.max(1, +(d.readTimes || 1));
  if (d.live) $('#n-tag').textContent = '对讲';
  Store.signedUrl(d.mediaPath).then(url => {
    if (!url) { toast('语音加载失败'); autoDismiss(3000); return; }
    let n = 0;
    const playOnce = () => {
      stopAudio();
      const audio = new Audio(url); S.audio = audio;
      audio.onended = () => {
        S.audio = null; n++;
        if (n < times) { setTimeout(() => { if (S.showing === m) playOnce(); }, 600); }
        else autoDismiss(1200);
      };
      audio.play().catch(() => { toast('请点击屏幕启用声音'); autoDismiss(8000); });
    };
    playOnce();
  });
}

/* ---------- 跑马灯（底部横向滚动） ---------- */
function showMarquee(m) {
  const d = m.data; const text = String(d.text || '').trim();
  if (!text) { S.showing = null; setTimeout(showNext, 200); return; }
  const layer = $('#marquee-layer'), track = $('#marquee-track');
  hideMarquee();
  $('#mq-who').textContent = (m.name || '老师') + ' · ' + fmtHM(new Date(m.created_at).getTime());
  const unit = text + '　　·　　';
  const rep = Math.max(1, Math.ceil(46 / Math.max(1, text.length)));
  track.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const s = document.createElement('span');
    s.className = 'mq-item';
    s.textContent = unit.repeat(rep);
    track.appendChild(s);
  }
  track.style.animation = 'none';
  void track.offsetWidth;
  track.style.animation = 'marqueeScroll ' + Math.max(16, text.length * 0.5) + 's linear infinite';
  layer.classList.add('show');
  bringToFront();
  if (Sound.unlocked && d.tts !== false) TTS.speak(text, d.readTimes || 1);
  const ms = (d.displaySec == null ? 30 : d.displaySec) * 1000;
  clearTimeout(S.marqueeTimer);
  S.marqueeTimer = setTimeout(() => { hideMarquee(); S.showing = null; setTimeout(showNext, 200); }, ms > 0 ? ms : 30000);
}
function hideMarquee() {
  clearTimeout(S.marqueeTimer);
  const l = $('#marquee-layer'); if (l) l.classList.remove('show');
}

function stopAudio() { if (S.audio) { try { S.audio.pause(); } catch (e) {} S.audio = null; } }
function autoDismiss(ms) { clearTimeout(S.autoTimer); if (!ms || ms <= 0) return; S.autoTimer = setTimeout(() => dismissNotice(), ms); }
function dismissNotice(silent) {
  clearTimeout(S.autoTimer); stopAudio(); TTS.stop(); hideMarquee();
  $('#notice-layer').classList.remove('show');
  S.showing = null;
  setTimeout(showNext, 250);
}
function interruptForVoice(m) {
  clearTimeout(S.autoTimer); hideMarquee();
  if (S.showing) { stopAudio(); TTS.stop(); $('#notice-layer').classList.remove('show'); S.showing = null; }
  S.queue = S.queue.filter(x => +x.id !== +m.id);
  S.showing = m;
  applyDisplayMode({ type: 'voice' });
  $('#notice-layer').classList.add('show');
  $('#n-tag').textContent = '对讲';
  $('#n-who').textContent = m.name || '老师';
  $('#n-time').textContent = '· ' + fmtHM(new Date(m.created_at).getTime());
  $('#n-body').innerHTML = '<div class="notice-voice">' + ICON.volume + '<span class="lbl">' + esc(m.name || '老师') + ' 正在对讲</span></div>';
  S.receipted = null; resetReceiptBtn(m);
  bringToFront();
  playNoticeVoice(m);
}

/* ---------- 收到（整班一次确认，学生不用逐个点） ---------- */
function resetReceiptBtn(m) {
  const btn = $('#n-receipt'); if (!btn) return;
  const live = m && m.data && m.data.live;
  btn.classList.remove('done');
  btn.disabled = false;
  btn.textContent = '收到了';
  // 对讲没有"收到确认"这回事，藏起来
  btn.style.display = live ? 'none' : '';
}

async function markReceived() {
  const m = S.showing; if (!m || !S.classId) return;
  if (S.receipted === String(m.id)) return;
  const btn = $('#n-receipt');
  S.receipted = String(m.id);
  btn.classList.add('done'); btn.disabled = true; btn.textContent = '✓ 已收到';
  try {
    await C.addReceipt(m.id, S.classId, { id: 'all', name: '全班', collective: true });
    toast('老师端已显示「班级已收到」', true);
    TTS.stop();
    setTimeout(() => { if (S.showing === m) dismissNotice(); }, 1600);
  } catch (e) {
    S.receipted = null; btn.classList.remove('done'); btn.disabled = false; btn.textContent = '收到了';
    toast('没记上，再点一次');
  }
}

document.addEventListener('click', async e => {
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

/* ---------- 抽人回答（名字不停转动，点击屏幕停止） ---------- */
const D = { running: false, multi: 1, picked: [], students: [], spin: null, startedAt: 0, ackStop: 0, lastDone: 0, hideTimer: null };

async function drawOpen() {
  if (!S.classId) { toast('请先选择班级'); return; }
  const ss = await C.listStudents(S.classId);
  if (!ss.length) {
    openScreenModal('抽人回答', '<div class="empty">还没有花名册<br>请先在老师端「班级 → 管理花名册」里录入学生姓名</div>');
    return;
  }
  openScreenModal('抽人回答',
    '<p class="iframe-note" style="margin:0 0 12px">选一次抽几个人，点「开始转动」，名字会快速滚动；<b>再点一下屏幕就停</b>。</p>' +
    '<div class="pills mb12" id="draw-count-pills">' +
      [1, 2, 3, 5].map(n => '<button class="pill' + (n === 1 ? ' active' : '') + '" data-dn="' + n + '">' + n + ' 人</button>').join('') +
    '</div>' +
    '<button class="btn block lg" id="draw-go">开始转动</button>');
  $$('#draw-count-pills .pill').forEach(b => b.addEventListener('click', () => {
    $$('#draw-count-pills .pill').forEach(x => x.classList.remove('active')); b.classList.add('active');
  }));
  $('#draw-go').onclick = () => {
    const act = $('#draw-count-pills .pill.active');
    closeScreenModal();
    drawStart(act ? +act.dataset.dn : 1);
  };
}

async function drawStart(n) {
  if (!S.classId) return;
  const ss = await C.listStudents(S.classId);
  if (!ss.length) { toast('请先录入花名册'); return; }
  D.students = ss;
  D.multi = Math.max(1, Math.min(+n || 1, ss.length));
  D.running = true; D.picked = []; D.startedAt = Date.now();
  clearTimeout(D.hideTimer);
  const layer = $('#draw-layer');
  layer.classList.add('show'); layer.classList.remove('done');
  $('#draw-tip').textContent = '名字滚动中 · 点一下屏幕停止';
  $('#draw-sub').textContent = '一次抽 ' + D.multi + ' 人';
  $('#draw-name').classList.add('spinning');
  spinTick();
  clearInterval(D.spin);
  D.spin = setInterval(spinTick, 70);
  if (Sound.unlocked) Beep.play(1);
  C.setDraw(S.classId, { status: 'running', multi: D.multi, picked: [], startedAt: D.startedAt, stopAt: 0, endedAt: 0 }).catch(() => {});
}

function spinTick() {
  if (!D.students.length) return;
  const pool = D.students.slice(), out = [];
  for (let i = 0; i < D.multi && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].name);
  }
  $('#draw-name').textContent = out.join('  ');
}

function drawStop() {
  if (!D.running) return;
  clearInterval(D.spin); D.spin = null; D.running = false;
  const pool = D.students.slice(), out = [];
  for (let i = 0; i < D.multi && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  D.picked = out;
  const names = out.map(s => s.name);
  const endedAt = Date.now();
  D.lastDone = endedAt;
  const layer = $('#draw-layer');
  $('#draw-name').classList.remove('spinning');
  $('#draw-name').textContent = names.join('  ');
  $('#draw-tip').textContent = names.length > 1 ? '请这几位同学回答问题' : '请这位同学回答问题';
  $('#draw-sub').textContent = '点一下屏幕关闭';
  layer.classList.add('done');
  if (Sound.unlocked) { Beep.play(2); TTS.speak(names.join('、') + '，请回答问题', 1); }
  C.setDraw(S.classId, { status: 'done', multi: D.multi, picked: names, startedAt: D.startedAt, stopAt: D.ackStop || 0, endedAt: endedAt }).catch(() => {});
  clearTimeout(D.hideTimer);
  D.hideTimer = setTimeout(() => { if (!D.running) hideDraw(); }, 30000);
}

function hideDraw() {
  clearInterval(D.spin); D.spin = null; D.running = false;
  const layer = $('#draw-layer');
  if (layer) { layer.classList.remove('show'); layer.classList.remove('done'); }
}

function showDrawResult(names) {
  if (!names || !names.length) return;
  const layer = $('#draw-layer');
  $('#draw-name').classList.remove('spinning');
  $('#draw-name').textContent = names.join('  ');
  $('#draw-tip').textContent = names.length > 1 ? '抽到的同学' : '抽到的同学';
  $('#draw-sub').textContent = '点一下屏幕关闭';
  layer.classList.add('show'); layer.classList.add('done');
  clearTimeout(D.hideTimer);
  D.hideTimer = setTimeout(() => { if (!D.running) hideDraw(); }, 30000);
}

/* 与云端同步：老师端点开始 / 停止也能生效 */
async function syncDraw() {
  if (!S.classId) return;
  const row = await C.drawState(S.classId);
  const d = row && row.data; if (!d) return;
  if (d.status === 'running') {
    if (D.running) {
      if (d.stopAt && d.stopAt > (D.ackStop || 0)) { D.ackStop = d.stopAt; drawStop(); }
      return;
    }
    // 上次打开页面时留下的「转动中」，超过 3 分钟就不再接手
    if (d.startedAt && Date.now() - d.startedAt > 3 * 60 * 1000) return;
    if (d.startedAt && D.startedAt && d.startedAt < D.startedAt) return;   // 旧的开始指令
    if (d.startedAt) { D.startedAt = d.startedAt; drawStart(d.multi || 1); }
    return;
  }
  if (d.status === 'done') {
    // 本轮开始之前留下的旧结果，直接忽略（否则刚点开始就被旧结果打断）
    if (d.endedAt && D.startedAt && d.endedAt < D.startedAt) return;
    if (D.running) { D.ackStop = d.stopAt || D.ackStop; drawStop(); return; }
    if (d.endedAt && d.endedAt !== D.lastDone) { D.lastDone = d.endedAt; showDrawResult(d.picked || []); }
  }
}

document.addEventListener('click', e => {
  if (e.target.closest('#s-draw') || e.target.closest('#draw-go') || e.target.closest('[data-dn]')) return;
  const layer = e.target.closest('#draw-layer');
  if (!layer) return;
  if (D.running) { drawStop(); return; }
  hideDraw();
});
