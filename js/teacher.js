/* ============ 班级小喇叭 · 老师端（云版 · 对齐参考图） ============ */
'use strict';

const T = {
  classId: null,
  targets: [],              // 本次发送的班级 id 列表
  mode: 'text',             // text | voice | walkie
  display: 'full',          // full | popup
  playTimes: 2,
  staySec: 30,
  fontSize: 'md',           // sm | md | lg | xl
  tts: true,
  autoClose: true,
  timing: 'now',            // now | scheduled
  repeat: 'weekdays',
  days: [1, 2, 3, 4, 5],
  hour: 17, minute: 10,
  logFilter: 'all',
  walkieRecording: false, walkieTimer: null,
  voiceRecording: false, voiceTimer: null, voiceBlob: null, voiceDur: 0, voiceUrl: null,
  playing: null,
  pendingFile: null,
  editSchedId: null,
  cache: { bound: [], messages: [], schedules: [], students: [], receipts: [] },
};

const PREFS_KEY = 'cs_prefs';
const STATE_KEY = 'cs_state';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    ['display', 'fontSize', 'timing', 'repeat'].forEach(k => { if (p[k]) T[k] = p[k]; });
    ['playTimes', 'staySec', 'hour', 'minute'].forEach(k => { if (typeof p[k] === 'number') T[k] = p[k]; });
    ['tts', 'autoClose'].forEach(k => { if (typeof p[k] === 'boolean') T[k] = p[k]; });
    if (Array.isArray(p.days) && p.days.length) T.days = p.days.slice();
  } catch (e) {}
}
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({
    display: T.display, playTimes: T.playTimes, staySec: T.staySec, fontSize: T.fontSize,
    tts: T.tts, autoClose: T.autoClose, timing: T.timing, repeat: T.repeat,
    days: T.days, hour: T.hour, minute: T.minute,
  }));
}
function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}'); } catch (e) { return {}; } }
function saveState(s) { localStorage.setItem(STATE_KEY, JSON.stringify(s)); }
function hhmm() { return pad2(T.hour) + ':' + pad2(T.minute); }

document.addEventListener('DOMContentLoaded', () => {
  $('#nav-logo').innerHTML = ICON.megaphone;
  $$('.ic-slot').forEach(s => { s.innerHTML = ICON[s.dataset.icon] || ''; });
  loadPrefs();
  Auth.gate(start);
});

function start() {
  bindEvents();
  TTS.init();
  restoreState();
  initWheels();
  syncPrefsUi();
  updateCharCount();
  refresh();
  setInterval(refresh, 2500);
}

function restoreState() {
  const st = loadState();
  if (st.currentClassId) T.classId = st.currentClassId;
}

/* ---------- 通用工具 ---------- */
function openSheet(id) { $('#' + id).classList.add('show'); }
function closeSheet(id) { $('#' + id).classList.remove('show'); }
function openModal(title, bodyHtml) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHtml; openSheet('sheet-modal'); }
function boundOf(id) { return T.cache.bound.find(c => String(c.id) === String(id)); }
function nameOf(id) { const c = boundOf(id); return c ? c.name : ''; }
function targetNames() { return T.targets.map(nameOf).filter(Boolean); }
function setClass(id) { T.classId = id; saveState(Object.assign(loadState(), { currentClassId: id })); }

/* ---------- 刷新 ---------- */
async function refresh() {
  try {
    const bound = await C.boundClasses();
    T.cache.bound = bound;
    if (!bound.some(c => String(c.id) === String(T.classId))) {
      T.classId = bound.length ? bound[0].id : null;
      saveState(Object.assign(loadState(), { currentClassId: T.classId }));
    }
    // 去掉已解绑/不存在的目标，首次默认选中当前班
    const ids = bound.map(c => String(c.id));
    T.targets = T.targets.filter(id => ids.includes(String(id)));
    if (!T.targets.length && T.classId) T.targets = [T.classId];

    if (T.classId) {
      const [messages, students, receipts] = await Promise.all([
        C.listMessages(T.classId, 40),
        C.listStudents(T.classId),
        C.receiptsOfClass(T.classId),
      ]);
      T.cache.messages = messages; T.cache.students = students; T.cache.receipts = receipts;
      T.cache.schedules = await C.listSchedules(T.classId);
    } else {
      T.cache.messages = []; T.cache.students = []; T.cache.receipts = []; T.cache.schedules = [];
    }
    renderAll();
  } catch (e) { console.warn('refresh', e); }
}

function renderAll() {
  renderNav(); renderPills(); renderCta(); renderPreview();
  renderFeed(); renderLog();
  if ($('#tab-cls').classList.contains('active')) renderClassTab();
  if ($('#tab-more').classList.contains('active')) renderMore();
  renderSchedules();
}

function renderNav() {
  const n = Auth.name() || '老师';
  $('#nav-avatar').textContent = n.slice(0, 1);
  $('#nav-avatar').title = n;
}

/* ---------- 发给：班级多选 ---------- */
function renderPills() {
  const box = $('#class-pills');
  if (!T.cache.bound.length) { box.innerHTML = '<span class="muted">还没有班级</span>'; return; }
  box.innerHTML = T.cache.bound.map(c => {
    const on = T.targets.some(id => String(id) === String(c.id));
    return '<button class="pill soft' + (on ? ' active' : '') + '" data-target="' + c.id + '">' + esc(c.name) + '</button>';
  }).join('');
  const allOn = T.cache.bound.length > 0 && T.targets.length === T.cache.bound.length;
  $('#btn-select-all').textContent = allOn ? '取消全选' : '全选';
}

/* ---------- 底部大按钮 ---------- */
function repeatLabel() {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  if (T.repeat === 'once') return '只发一次';
  if (T.repeat === 'daily') return '每天';
  if (T.repeat === 'custom') {
    const ds = T.days.slice().sort((a, b) => a - b);
    if (ds.length === 7) return '每天';
    if (ds.length > 4) return '每周' + ds.length + '天';
    if (!ds.length) return '自选';
    return '周' + ds.map(d => names[d]).join('、');
  }
  return '周一至五';
}

function renderCta() {
  const btn = $('#btn-send');
  const names = targetNames();
  let who = names.length === 0 ? '' : (names.length === 1 ? names[0] : names.length + ' 个班级');
  let label;
  if (T.mode === 'walkie') label = '按住上方按钮即可对讲';
  else if (!names.length) label = '请先选择班级';
  else if (T.timing === 'now') label = '立即发到 ' + who;
  else label = repeatLabel() + ' ' + hhmm() + ' 发到 ' + who;
  btn.textContent = label;
  btn.disabled = !names.length || T.mode === 'walkie';
}

/* ---------- 屏幕预览 ---------- */
function previewText() {
  if (T.mode === 'voice') return '（语音留言）点开后大屏直接播放';
  if (T.mode === 'walkie') return '（对讲）按住说话，教室大屏立即播放';
  const v = ($('#notice-text') && $('#notice-text').value || '').trim();
  return v || '大屏会在这里显示你要发的内容';
}
function renderPreview() {
  const el = $('#pv-text');
  if (!el) return;
  el.textContent = previewText();
  el.style.fontSize = { sm: 14, md: 17, lg: 20, xl: 24 }[T.fontSize] + 'px';
  const who = Auth.name() || '老师';
  $('#pv-foot').textContent = who + ' · ' + (T.timing === 'now' ? fmtHM(Date.now()) : hhmm());
  $('#display-summary').textContent =
    (T.display === 'popup' ? '弹窗' : '全屏') + ' · 读' + T.playTimes + '遍 · ' + (T.staySec ? T.staySec + '秒' : '常驻');
}

/* ---------- 消息卡片 ---------- */
function typeChip(m) {
  const d = m.data;
  if (d.tag) return '<span class="tag-chip">' + esc(d.tag) + '</span>';
  if (d.type === 'image') return '<span class="tag-chip blue">图片通知</span>';
  if (d.type === 'voice') return d.live ? '<span class="tag-chip red">对讲</span>' : '<span class="tag-chip blue">语音留言</span>';
  return '';
}
function receiptsFor(msgId) { return T.cache.receipts.filter(r => String(r.data.msg_id) === String(msgId)); }

function msgCard(m) {
  const d = m.data;
  const rc = receiptsFor(m.id);
  const total = T.cache.students.length;
  const time = m.created_at ? new Date(m.created_at).getTime() : d.ts;
  let inner = '';
  if (d.type === 'text') inner = '<div class="msg-text">' + esc(d.text) + '</div>';
  else if (d.type === 'image') {
    if (d.text) inner += '<div class="msg-text">' + esc(d.text) + '</div>';
    inner += '<img class="msg-img" data-mpath="' + esc(d.mediaPath) + '">';
  } else if (d.type === 'voice') {
    inner += '<button class="play-btn" data-play="' + esc(d.mediaPath) + '">' + ICON.play + '回放 ' + fmtDur(d.duration || 0) + '</button>';
  }
  const foot = '<span class="receipt-btn" data-receipt="' + m.id + '">' + ICON.check + '已收到 ' + rc.length + (total ? '/' + total : '') + '</span>';
  return '<div class="msg-card">' +
    '<div class="msg-head">' + typeChip(m) + '<span class="muted small" style="margin-left:auto">' + fmtMDHM(time) + '</span></div>' +
    inner +
    '<div class="msg-foot"><span class="who">' + esc(m.name || '') + (d.readTimes ? ' · 读' + d.readTimes + '遍' : '') + '</span>' + foot + '</div>' +
    '</div>';
}

function renderFeed() {
  const box = $('#msg-feed');
  if (!T.classId) { box.innerHTML = '<div class="empty">创建或加入班级后开始发通知</div>'; $('#feed-count').textContent = ''; return; }
  const list = T.cache.messages.slice(0, 6);
  $('#feed-count').textContent = T.cache.messages.length ? '共 ' + T.cache.messages.length + ' 条' : '';
  box.innerHTML = list.length ? list.map(msgCard).join('') : '<div class="empty">' + ICON.megaphone + '还没有通知，发一条试试</div>';
  hydrateImages(box);
}

function renderLog() {
  const box = $('#log-feed');
  if (!box) return;
  if (!T.classId) { box.innerHTML = '<div class="empty">暂无班级</div>'; return; }
  const f = T.logFilter;
  const list = T.cache.messages.filter(m => {
    const d = m.data;
    if (f === 'all') return true;
    if (f === 'live') return d.type === 'voice' && d.live;
    if (f === 'voice') return d.type === 'voice' && !d.live;
    return d.type === f;
  });
  box.innerHTML = list.length ? list.map(msgCard).join('') : '<div class="empty">这个分类下还没有记录</div>';
  hydrateImages(box);
}

function hydrateImages(root) {
  $$('[data-mpath]', root).forEach(img => {
    const p = img.dataset.mpath; if (!p || img.dataset.hydrated) return;
    img.dataset.hydrated = '1';
    img.style.background = '#EEF2F1';
    Store.signedUrl(p).then(u => { if (u) { img.src = u; img.style.background = 'none'; } });
  });
}

/* ---------- 语音回放 ---------- */
function stopPlaying() {
  if (T.playing) {
    try { T.playing.audio.pause(); } catch (e) {}
    if (T.playing.btn) T.playing.btn.classList.remove('playing');
    T.playing = null;
  }
}
function playVoice(path, btn) {
  if (T.playing && T.playing.btn === btn) { stopPlaying(); return; }
  stopPlaying();
  Store.signedUrl(path).then(url => {
    if (!url) { toast('音频加载失败'); return; }
    const audio = new Audio(url);
    if (btn) btn.classList.add('playing');
    T.playing = { audio: audio, btn: btn };
    audio.onended = () => { if (btn) btn.classList.remove('playing'); if (T.playing && T.playing.audio === audio) T.playing = null; };
    audio.play().catch(() => { toast('播放失败，请先点一下页面'); if (btn) btn.classList.remove('playing'); });
  });
}

/* ---------- 发送 ---------- */
function payload() {
  return {
    displayMode: T.display,
    readTimes: T.playTimes,
    staySec: T.staySec,
    displaySec: T.autoClose ? T.staySec : 0,
    fontSize: T.fontSize,
    tts: T.tts,
  };
}

async function sendToTargets(build) {
  const ids = T.targets.slice();
  if (!ids.length) { toast('请选择要发送的班级'); return false; }
  for (const id of ids) {
    const p = await build();
    await C.addMessage(Object.assign({ classId: id }, p));
  }
  return true;
}

function extOf(file) {
  const m = /image\/(\w+)/.exec(file.type || '');
  if (m) return m[1] === 'jpeg' ? 'jpg' : m[1];
  const i = (file.name || '').lastIndexOf('.');
  return i >= 0 ? file.name.slice(i + 1) : 'img';
}

async function sendNow() {
  const txt = ($('#notice-text').value || '').trim();
  const base = payload();

  if (T.mode === 'text') {
    if (T.pendingFile) {
      const file = T.pendingFile;
      if (file.size > 15 * 1024 * 1024) { toast('图片不能超过 15MB'); return; }
      toast('正在上传图片…');
      try {
        const path = await Store.upload(file, extOf(file));
        const ok = await sendToTargets(() => Object.assign({ type: 'image', mediaPath: path, text: txt, live: false, tag: '' }, base, { readTimes: txt ? base.readTimes : 0 }));
        if (ok) { T.pendingFile = null; $('#notice-text').value = ''; toast('图片已发到大屏', true); refresh(); }
      } catch (e) { toast('上传失败：' + (e.message || e)); }
      return;
    }
    if (!txt) { toast('请输入要发的内容'); return; }
    if (!T.classId && !T.targets.length) { toast('请先创建或加入班级'); return; }
    const ok = await sendToTargets(() => Object.assign({ type: 'text', text: txt, live: false, tag: '' }, base));
    if (ok) {
      $('#notice-text').value = ''; updateCharCount(); renderPreview();
      toast('已发送，教室大屏弹出大字并朗读', true); refresh();
    }
    return;
  }

  if (T.mode === 'voice') {
    if (!T.voiceBlob) { toast('请先录一段语音'); return; }
    toast('正在上传语音…');
    try {
      const path = await Store.upload(T.voiceBlob, 'webm');
      const dur = T.voiceDur;
      const ok = await sendToTargets(() => Object.assign({ type: 'voice', mediaPath: path, duration: dur, live: false, tag: '', text: '', readTimes: 0 }, base));
      if (ok) { resetVoice(); toast('语音通知已发送', true); refresh(); }
    } catch (e) { toast('上传失败：' + (e.message || e)); }
  }
}

/* 定时：把当前内容存成一条定时任务（多个班各存一条） */
async function saveScheduled() {
  const txt = ($('#notice-text').value || '').trim();
  if (!txt) { toast('定时通知需要先输入文字内容'); return; }
  if (!T.targets.length) { toast('请选择要发送的班级'); return; }
  if (T.repeat === 'custom' && !T.days.length) { toast('请选择自选的星期'); return; }
  let fireDate = '';
  if (T.repeat === 'once') {
    const now = new Date();
    fireDate = todayKey(now);
    if (hhmm() <= pad2(now.getHours()) + ':' + pad2(now.getMinutes())) fireDate = todayKey(new Date(now.getTime() + 86400000));
  }
  const data = Object.assign({
    text: txt, time: hhmm(), repeat: T.repeat, days: T.days.slice(),
    fireDate: fireDate, enabled: true, type: 'text',
  }, payload());
  for (const id of T.targets) {
    await C.saveSchedule({ classId: id, name: txt.slice(0, 14), data: data });
  }
  toast(repeatLabel() + ' ' + hhmm() + ' 开始自动发送', true);
  T.cache.schedules = T.classId ? await C.listSchedules(T.classId) : [];
  renderSchedules();
}

/* ---------- 文字 / 图片 ---------- */
function updateCharCount() {
  const v = $('#notice-text').value || '';
  $('#char-count').textContent = v.length + '/300';
  renderPreview(); renderCta();
}

/* ---------- 录音（发语音） ---------- */
function voiceToggle() {
  if (!T.voiceRecording) {
    Recorder.start().then(() => {
      T.voiceRecording = true;
      $('#voice-rec-btn').classList.add('rec');
      $('#voice-tip').textContent = '正在录音… 再点一下结束';
      $('#voice-rec-timer').hidden = false;
      const t0 = Date.now();
      T.voiceTimer = setInterval(() => { $('#voice-rec-sec').textContent = fmtDur((Date.now() - t0) / 1000); }, 200);
    }).catch(e => toast(e.message));
  } else { stopVoiceRecord(); }
}
async function stopVoiceRecord() {
  if (!T.voiceRecording) return;
  T.voiceRecording = false; clearInterval(T.voiceTimer);
  const res = await Recorder.stop();
  $('#voice-rec-btn').classList.remove('rec');
  $('#voice-rec-timer').hidden = true;
  $('#voice-tip').textContent = '点一下开始录音，再点一下结束并发送';
  if (!res || !res.blob || res.duration < 0.8) { toast('录音太短，请重录'); return; }
  if (T.voiceUrl) URL.revokeObjectURL(T.voiceUrl);
  T.voiceBlob = res.blob; T.voiceDur = res.duration;
  T.voiceUrl = URL.createObjectURL(res.blob);
  $('#voice-done').hidden = false;
  $('#voice-dur').textContent = fmtDur(res.duration);
  toast('录音完成，点下方按钮发送', true);
}
function resetVoice() {
  T.voiceBlob = null; T.voiceDur = 0;
  if (T.voiceUrl) { URL.revokeObjectURL(T.voiceUrl); T.voiceUrl = null; }
  $('#voice-done').hidden = true;
}

/* ---------- 对讲（按住说话，立即播） ---------- */
async function walkieStart() {
  if (T.walkieRecording) return;
  if (!T.targets.length) { toast('请先选择班级'); return; }
  try {
    await Recorder.start();
    T.walkieRecording = true;
    $('#walkie-btn').classList.add('rec');
    $('#walkie-lbl').textContent = '松开发送';
    $('#walkie-timer').hidden = false; $('#walkie-live').hidden = false;
    const t0 = Date.now();
    T.walkieTimer = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      $('#walkie-sec').textContent = fmtDur(s);
      if (s >= 60) walkieEnd();
    }, 200);
  } catch (e) { toast(e.message); }
}
async function walkieEnd() {
  if (!T.walkieRecording) return;
  T.walkieRecording = false; clearInterval(T.walkieTimer);
  const res = await Recorder.stop();
  $('#walkie-btn').classList.remove('rec');
  $('#walkie-lbl').textContent = '按住说话';
  $('#walkie-timer').hidden = true; $('#walkie-live').hidden = true;
  if (!res || !res.blob) { toast('没有录到声音'); return; }
  if (res.duration < 0.6) { toast('说话时间太短'); return; }
  try {
    const path = await Store.upload(res.blob, 'webm');
    const dur = res.duration;
    const ok = await sendToTargets(() => Object.assign({ type: 'voice', mediaPath: path, duration: dur, live: true, tag: '', text: '', readTimes: 0 }, payload()));
    if (ok) { toast('已发到大屏，教室立即播放', true); refresh(); }
  } catch (e) { toast('上传失败：' + (e.message || e)); }
}

/* ---------- 轮盘选时 ---------- */
function buildWheel(el, count, onPick) {
  el.innerHTML = '<div class="wheel-pad"></div>' +
    Array.from({ length: count }, (_, i) => '<div class="wheel-item" data-i="' + i + '">' + pad2(i) + '</div>').join('') +
    '<div class="wheel-pad"></div>';
  el.addEventListener('click', e => {
    const it = e.target.closest('.wheel-item'); if (!it) return;
    el.scrollTo({ top: (+it.dataset.i) * 46, behavior: 'smooth' });
  });
  let timer = null;
  el.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / 46)));
      markWheel(el, i); onPick(i);
    }, 90);
  }, { passive: true });
}
function markWheel(el, idx) {
  $$('.wheel-item', el).forEach(n => n.classList.toggle('sel', +n.dataset.i === idx));
}
function setWheel(el, idx) {
  el.scrollTop = idx * 46;
  markWheel(el, idx);
}
function initWheels() {
  const wh = $('#wheel-hour'), wm = $('#wheel-min');
  if (!wh || !wm) return;
  buildWheel(wh, 24, i => { T.hour = i; savePrefs(); renderCta(); renderPreview(); updateWheelNote(); });
  buildWheel(wm, 60, i => { T.minute = i; savePrefs(); renderCta(); renderPreview(); updateWheelNote(); });
  // 等布局完成后再定位，否则 scrollTop 会被夹到 0
  const place = () => { setWheel(wh, T.hour); setWheel(wm, T.minute); };
  place();
  requestAnimationFrame(place);
  setTimeout(place, 120);
  updateWheelNote();
}
function updateWheelNote() {
  const el = $('#wheel-note'); if (!el) return;
  const when = T.repeat === 'daily' ? '每天' : '今天';
  el.textContent = '第一次：' + when + ' ' + hhmm() + ' 自动发送（' + repeatLabel() + '），放假可在「记录 → 定时任务」里暂停';
}

/* ---------- 班级 Tab ---------- */
function renderClassTab() {
  const box = $('#cls-wrap');
  const c = boundOf(T.classId);
  if (!c) {
    box.innerHTML =
      '<h1 class="h1">班级</h1>' +
      '<div class="card"><div class="card-label">开始使用</div>' +
      '<p class="iframe-note" style="margin:0 0 14px">先建一个班级，或者用绑定码加入同事已经建好的班（别的老师可以同时绑定同一个班）。</p>' +
      '<div class="field"><label>新建班级</label><input type="text" id="ob-class" placeholder="如：三年2班"></div>' +
      '<button class="btn block lg" id="ob-create">创建班级并进入</button>' +
      '<div class="divider"></div>' +
      '<div class="field" style="margin-bottom:8px"><label>用绑定码加入</label><input type="text" id="ob-code" inputmode="numeric" maxlength="6" placeholder="输入 6 位绑定码"></div>' +
      '<button class="btn ghost block" id="ob-join">加入班级</button></div>';
    return;
  }
  const students = T.cache.students;
  box.innerHTML =
    '<h1 class="h1">班级</h1>' +
    '<div class="card"><div class="card-label">当前班级 · ' + esc(c.name) + '</div>' +
    '<div class="code-big">' + esc(c.code) + '</div>' +
    '<button class="btn sm ghost block mt12" data-action="copy-code">' + ICON.copy + '复制绑定码</button>' +
    '<p class="iframe-note mt12" style="margin-bottom:0">这个码有两个用处：① 其他老师扫码登录后输入它，即可<b>同时绑定本班</b>；② 教室大屏、学生收到页、点名页输入它就能<b>免登录</b>接收通知。</p></div>' +

    '<div class="card"><div class="card-label">我的班级（' + T.cache.bound.length + '）</div>' +
    T.cache.bound.map(b => '<div class="list-item"><div class="grow"><div style="font-weight:600">' + esc(b.name) +
      (String(b.id) === String(T.classId) ? ' <span class="tag-chip">当前</span>' : '') +
      '</div><div class="muted small">绑定码 ' + esc(b.code) + '</div></div>' +
      (String(b.id) === String(T.classId) ? '' : '<button class="btn sm ghost" data-setclass="' + b.id + '">切换</button>') +
      '<button class="btn sm ghost-danger" data-unbind="' + b.id + '">解绑</button></div>').join('') +
    '<div class="row mt12"><button class="btn ghost grow sm" data-action="create-class">' + ICON.plus + '新建班级</button>' +
    '<button class="btn ghost grow sm" data-action="join-class">绑定码加入</button></div></div>' +

    '<div class="card"><div class="card-label">花名册 <span class="act">' + students.length + ' 人</span></div>' +
    (students.length ? '<div class="pills mb12">' + students.map(s => '<span class="pill soft" style="cursor:default">' + esc(s.name) + '</span>').join('') + '</div>'
      : '<div class="empty" style="padding:14px">还没有名单，点名和「已收到」统计需要花名册</div>') +
    '<button class="btn ghost block sm" data-action="edit-roster">' + ICON.edit + '管理花名册</button></div>' +

    '<div class="card"><div class="card-label">屏幕</div>' +
    '<button class="entry-card" style="box-shadow:none;padding:12px 0;margin:0" data-action="open-screen">' +
    '<span class="ic-box b"><span class="ic-slot2">' + ICON.screen + '</span></span>' +
    '<span class="grow"><span class="t1">打开教室大屏</span><span class="t2">在大屏电脑上打开，保持常亮</span></span><span class="arrow">›</span></button>' +
    '<button class="entry-card" style="box-shadow:none;padding:12px 0;margin:0;border-top:1px solid var(--line)" data-action="open-student">' +
    '<span class="ic-box"><span class="ic-slot2">' + ICON.users + '</span></span>' +
    '<span class="grow"><span class="t1">学生收到页</span><span class="t2">学生用手机打开，点自己名字确认收到</span></span><span class="arrow">›</span></button></div>';
}

/* ---------- 我的 Tab ---------- */
function renderMore() {
  const box = $('#more-wrap');
  box.innerHTML =
    '<h1 class="h1">我的</h1>' +
    '<div class="card"><div class="row"><div class="avatar g">' + esc((Auth.name() || '师').slice(0, 1)) + '</div>' +
    '<div class="grow"><div style="font-weight:700">' + esc(Auth.name() || '老师') + '</div>' +
    '<div class="muted small">姓名登录 · 无需密码</div></div>' +
    '<button class="btn sm gray" data-action="rename">改姓名</button></div></div>' +

    '<button class="entry-card" data-action="open-screen">' +
    '<span class="ic-box b"><span class="ic-slot2">' + ICON.screen + '</span></span>' +
    '<span class="grow"><span class="t1">教室大屏</span><span class="t2">弹出大字 + 朗读，收到对讲立即播放</span></span><span class="arrow">›</span></button>' +
    '<button class="entry-card" data-action="open-student">' +
    '<span class="ic-box"><span class="ic-slot2">' + ICON.users + '</span></span>' +
    '<span class="grow"><span class="t1">学生收到页</span><span class="t2">花名册点名字，确认收到</span></span><span class="arrow">›</span></button>' +
    '<button class="entry-card" data-action="open-rollcall">' +
    '<span class="ic-box o"><span class="ic-slot2">' + ICON.check + '</span></span>' +
    '<span class="grow"><span class="t1">点名 · 倒计时</span><span class="t2">随机点名、课堂计时，同步大屏</span></span><span class="arrow">›</span></button>' +

    '<div class="card"><div class="card-label">账号</div>' +
    '<p class="iframe-note" style="margin:0 0 12px">当前用<b>姓名</b>登录，不需要密码。姓名和班级绑定保存在这台设备上；换手机或换电脑时，重新输入姓名、再输入一次<b>绑定码</b>就能回到原来的班级。</p>' +
    '<div class="row"><button class="btn ghost-danger grow sm" data-action="signout">清除本机身份</button></div></div>' +

    '<div class="card"><div class="card-label">使用说明</div>' +
    '<p class="iframe-note" style="margin:0">• 教室电脑打开「教室大屏」，输入一次<b>绑定码</b>即可，不用登录；点一次<b>启用声音</b>后保持常开。<br>' +
    '• 对讲：按住说话，松开后大屏立即播放，记录可在「记录」里回放。<br>' +
    '• 定时：放学提醒、眼保健操建班时已自动创建，可在「记录 → 定时任务」改时间或暂停。<br>' +
    '• 多老师：把绑定码给同事，他们扫码登录后输入同一绑定码，即可同时绑定本班。</p></div>';
}

/* ---------- 定时任务列表 ---------- */
function repeatLabelOf(s) {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  if (s.repeat === 'once') return '只发一次' + (s.fireDate ? ' · ' + s.fireDate.slice(5).replace('-', '/') : '');
  if (s.repeat === 'daily') return '每天';
  if (s.repeat === 'custom') return '周' + (s.days || []).slice().sort().map(d => names[d]).join('、');
  return '周一至五';
}
function renderSchedules() {
  const box = $('#schedule-list');
  if (!box) return;
  if (!T.classId) { box.innerHTML = '<div class="empty">暂无班级</div>'; return; }
  const list = T.cache.schedules.slice().sort((a, b) => (a.data.time || '').localeCompare(b.data.time || ''));
  box.innerHTML = list.length ? list.map(row =>
    '<div class="sched-item"><div class="st1">' +
    '<span class="tag-chip">' + ICON.clock + ' ' + esc(row.data.time) + '</span>' +
    '<span class="nm ellipsis">' + esc(row.name) + '</span>' +
    '<span class="grow"></span>' +
    '<label class="switch"><input type="checkbox" data-sched-toggle="' + row.id + '"' + (row.data.enabled ? ' checked' : '') + '><span class="track"></span></label>' +
    '</div><div class="st2">' + esc(row.data.text) + '</div>' +
    '<div class="st3"><span class="muted small">' + repeatLabelOf(row.data) + '</span><span class="grow"></span>' +
    '<button class="chip-btn" data-sched-edit="' + row.id + '">编辑</button>' +
    '<button class="chip-btn" data-sched-del="' + row.id + '">删除</button></div></div>'
  ).join('') : '<div class="empty" style="padding:16px">还没有定时任务，点右上角新建</div>';
}

function openSchedSheet(row) {
  T.editSchedId = row ? row.id : null;
  const s = row ? row.data : null;
  const repeat = s ? s.repeat : 'weekdays';
  const days = s && s.days ? s.days.slice() : [1, 2, 3, 4, 5];
  const time = s ? s.time : '16:50';
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  openModal(row ? '编辑定时任务' : '新建定时任务',
    '<div class="field"><label>名称</label><input type="text" id="sd-name" placeholder="如：放学提醒 / 眼保健操" value="' + esc(row ? row.name : '') + '"></div>' +
    '<div class="field"><label>大屏显示并朗读的内容</label><textarea id="sd-text" rows="3">' + esc(s ? s.text : '') + '</textarea></div>' +
    '<div class="field"><label>重复</label><div class="seg" id="sd-repeat">' +
    ['once:只发一次', 'weekdays:周一至五', 'daily:每天', 'custom:自选'].map(p => {
      const [v, lbl] = p.split(':');
      return '<button data-v="' + v + '"' + (v === repeat ? ' class="active"' : '') + '>' + lbl + '</button>';
    }).join('') + '</div>' +
    '<div class="pills mt8" id="sd-days"' + (repeat === 'custom' ? '' : ' hidden') + '>' +
    [0, 1, 2, 3, 4, 5, 6].map(d => '<button class="pill soft' + (days.includes(d) ? ' active' : '') + '" data-d="' + d + '">' + names[d] + '</button>').join('') + '</div></div>' +
    '<div class="field"><label>几点发</label><div class="row"><input type="time" id="sd-time" value="' + time + '" style="flex:1">' +
    '<button class="chip-btn" data-qtime="09:55">眼操·上午</button><button class="chip-btn" data-qtime="14:35">眼操·下午</button></div></div>' +
    '<button class="btn block lg" id="sd-save">保存</button>');
  $('#sd-save').onclick = () => saveSched(row);
  $$('#sd-repeat button').forEach(b => b.addEventListener('click', () => {
    $$('#sd-repeat button').forEach(x => x.classList.remove('active')); b.classList.add('active');
    $('#sd-days').hidden = b.dataset.v !== 'custom';
  }));
  $$('#sd-days .pill').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
  $$('[data-qtime]').forEach(b => b.addEventListener('click', () => { $('#sd-time').value = b.dataset.qtime; }));
}

async function saveSched(row) {
  const name = $('#sd-name').value.trim();
  const text = $('#sd-text').value.trim();
  const time = $('#sd-time').value;
  const repeat = ($('#sd-repeat .active') || {}).dataset ? $('#sd-repeat .active').dataset.v : 'weekdays';
  const days = $$('#sd-days .pill.active').map(b => +b.dataset.d);
  if (!name) { toast('请填写名称'); return; }
  if (!text) { toast('请填写内容'); return; }
  if (!time) { toast('请选择时间'); return; }
  if (repeat === 'custom' && !days.length) { toast('请选择星期'); return; }
  let fireDate = '';
  if (repeat === 'once') {
    const now = new Date();
    fireDate = todayKey(now);
    if (time <= pad2(now.getHours()) + ':' + pad2(now.getMinutes())) fireDate = todayKey(new Date(now.getTime() + 86400000));
  }
  const old = row ? row.data : {};
  const data = Object.assign({}, old, {
    text: text, time: time, repeat: repeat, days: days, fireDate: fireDate,
    enabled: row ? !!old.enabled : true, type: 'text',
  });
  await C.saveSchedule({ id: row ? row.id : null, classId: T.classId, name: name, data: data });
  closeSheet('sheet-modal');
  toast('定时任务已保存', true);
  T.cache.schedules = await C.listSchedules(T.classId);
  renderSchedules();
}

/* ---------- 弹层：花名册 / 收到情况 ---------- */
function openRosterSheet() {
  openModal('管理花名册（' + (nameOf(T.classId) || '班级') + '）',
    '<div class="field"><label>每行一个名字（也可用逗号、空格分隔），保存会覆盖原名单</label>' +
    '<textarea id="roster-input" rows="8" placeholder="张小明&#10;李小红&#10;王小雨">' + esc(T.cache.students.map(s => s.name).join('\n')) + '</textarea></div>' +
    '<button class="btn block lg" id="roster-save">保存花名册</button>');
  $('#roster-save').onclick = async () => {
    const names = $('#roster-input').value.split(/[\n,，、\s]+/).map(x => x.trim()).filter(Boolean);
    await C.setStudents(T.classId, names);
    closeSheet('sheet-modal');
    toast('花名册已保存：' + names.length + ' 人', true);
    refresh();
  };
}

function openReceiptModal(msgId) {
  const m = T.cache.messages.find(x => String(x.id) === String(msgId)); if (!m) return;
  const rc = receiptsFor(m.id);
  const gotIds = rc.map(r => String(r.data.student_id));
  const miss = T.cache.students.filter(s => !gotIds.includes(String(s.id)));
  openModal('收到情况 · ' + fmtMDHM(new Date(m.created_at).getTime()),
    '<div class="tag-chip mb12">' + esc(m.data.tag || (m.data.type === 'image' ? '图片通知' : '通知')) + ' · 已收到 ' + rc.length + ' 人</div>' +
    (rc.length ? '<div class="card-label" style="margin:6px 0">已收到</div><div class="pills mb12">' + rc.map(r => '<span class="pill soft active" style="cursor:default">' + esc(r.data.name) + '</span>').join('') + '</div>' : '') +
    (miss.length ? '<div class="card-label" style="margin:6px 0">未收到</div><div class="pills">' + miss.map(s => '<span class="pill soft" style="cursor:default">' + esc(s.name) + '</span>').join('') + '</div>'
      : (rc.length ? '<div class="center muted small mt12">全班都已收到</div>' : '<div class="center muted small mt12">还没有人确认收到</div>')));
}

/* ---------- 事件 ---------- */
function switchTab(tabId) {
  $$('#tabbar button').forEach(x => x.classList.toggle('active', x.dataset.tab === tabId));
  $$('.tab').forEach(x => x.classList.toggle('active', x.id === tabId));
  renderAll();
}

function bindEvents() {
  $$('#tabbar button[data-tab]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('#btn-open-screen').addEventListener('click', () => window.open('screen.html', '_blank'));
  $('#go-rollcall').addEventListener('click', () => { location.href = 'rollcall.html'; });
  $('#go-timer').addEventListener('click', () => { location.href = 'rollcall.html#timer'; });

  // 发给
  $('#btn-select-all').addEventListener('click', () => {
    const all = T.cache.bound.map(c => c.id);
    T.targets = T.targets.length === all.length ? [] : all;
    renderPills(); renderCta();
  });

  // 模式
  $$('#mode-seg button').forEach(b => b.addEventListener('click', () => {
    T.mode = b.dataset.mode;
    $$('#mode-seg button').forEach(x => x.classList.toggle('active', x === b));
    $$('.pane').forEach(p => p.classList.remove('active'));
    $('#pane-' + T.mode).classList.add('active');
    renderCta(); renderPreview();
  }));

  // 文字
  $('#notice-text').addEventListener('input', updateCharCount);
  $('#btn-clear').addEventListener('click', () => {
    $('#notice-text').value = ''; T.pendingFile = null;
    $('#btn-image').innerHTML = '<span class="ic-slot2">' + ICON.image + '</span>传图片';
    updateCharCount();
  });
  $('#btn-image').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    T.pendingFile = f;
    $('#btn-image').innerHTML = '<span class="ic-slot2">' + ICON.image + '</span>已选图片 ✓';
    toast('图片已选择，点下方大按钮发送', true);
  });

  // 展示设置
  bindPicks('pick-display', v => { T.display = v; });
  bindPicks('pick-times', v => { T.playTimes = +v; });
  bindPicks('pick-stay', v => { T.staySec = +v; });
  bindPicks('pick-size', v => { T.fontSize = v; });
  $('#sw-tts').addEventListener('change', e => { T.tts = e.target.checked; });
  $('#sw-autoclose').addEventListener('change', e => { T.autoClose = e.target.checked; });

  // 发送时间
  $$('#time-seg button').forEach(b => b.addEventListener('click', () => {
    T.timing = b.dataset.v;
    $$('#time-seg button').forEach(x => x.classList.toggle('active', x === b));
    $('#sched-box').hidden = T.timing !== 'scheduled';
    renderCta();
  }));
  $$('#repeat-seg button').forEach(b => b.addEventListener('click', () => {
    T.repeat = b.dataset.v;
    $$('#repeat-seg button').forEach(x => x.classList.toggle('active', x === b));
    $('#days-pills').hidden = T.repeat !== 'custom';
    renderDays(); updateWheelNote(); renderCta();
  }));

  // 录音 / 对讲
  $('#voice-rec-btn').addEventListener('click', voiceToggle);
  $('#voice-replay').addEventListener('click', () => { if (T.voiceUrl) new Audio(T.voiceUrl).play().catch(() => {}); });

  const wb = $('#walkie-btn');
  wb.addEventListener('pointerdown', e => { e.preventDefault(); try { wb.setPointerCapture(e.pointerId); } catch (x) {} walkieStart(); });
  wb.addEventListener('pointerup', e => { e.preventDefault(); walkieEnd(); });
  wb.addEventListener('pointercancel', () => walkieEnd());
  wb.addEventListener('pointerleave', () => { if (T.walkieRecording) walkieEnd(); });
  wb.addEventListener('contextmenu', e => e.preventDefault());

  // 发送
  $('#btn-send').addEventListener('click', () => {
    if (T.mode === 'walkie') return;
    if (T.timing === 'scheduled') return saveScheduled();
    sendNow();
  });

  // 课堂快捷
  document.addEventListener('click', e => {
    const qt = e.target.closest('[data-timer]');
    if (qt) { quickTimer(+qt.dataset.timer, qt.dataset.label); return; }
    const qb = e.target.closest('[data-quick]');
    if (qb) { quickBroadcast(qb.dataset.quick); return; }
  });

  $('#btn-add-sched').addEventListener('click', () => openSchedSheet(null));
  $$('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet(b.dataset.close)));
  $$('.overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('show'); }));

  // 建班 / 加入班级（「班级」页内联表单）
  document.addEventListener('click', async e => {
    const btn = e.target.closest('#ob-create, #ob-join'); if (!btn) return;
    if (btn.id === 'ob-create') {
      const name = $('#ob-class').value.trim();
      if (!name) { toast('请填写班级名称'); return; }
      const c = await C.createClass(name);
      setClass(c.id); T.targets = [c.id];
      toast('班级已创建，放学提醒与眼保健操已自动设好', true); refresh();
    }
    if (btn.id === 'ob-join') {
      const code = $('#ob-code').value.trim();
      if (!/^\d{6}$/.test(code)) { toast('请输入 6 位绑定码'); return; }
      const c = await C.clsByCode(code);
      if (!c) { toast('绑定码不存在，请核对'); return; }
      await C.bind(c.id);
      setClass(c.id); T.targets = [c.id];
      toast('已加入 ' + c.name, true); refresh();
    }
  });

  // 全局委托
  document.addEventListener('click', async e => {
    const tg = e.target.closest('[data-target]');
    if (tg) {
      const id = tg.dataset.target;
      const i = T.targets.findIndex(x => String(x) === String(id));
      if (i >= 0) T.targets.splice(i, 1); else T.targets.push(id);
      if (i < 0) setClass(id);
      renderPills(); renderCta(); return;
    }
    const playBtn = e.target.closest('[data-play]'); if (playBtn) { playVoice(playBtn.dataset.play, playBtn); return; }
    const img = e.target.closest('.msg-img'); if (img && img.src) { openModal('图片预览', '<img src="' + img.src + '" style="border-radius:14px;width:100%">'); return; }
    const rc = e.target.closest('[data-receipt]'); if (rc) { openReceiptModal(rc.dataset.receipt); return; }
    const sc = e.target.closest('[data-setclass]'); if (sc) { setClass(+sc.dataset.setclass); renderClassTab(); renderPills(); return; }
    const st = e.target.closest('[data-sched-toggle]');
    if (st) { await C.setScheduleEnabled(+st.dataset.schedToggle, st.checked); toast(st.checked ? '已启用' : '已暂停'); return; }
    const se = e.target.closest('[data-sched-edit]');
    if (se) { openSchedSheet(T.cache.schedules.find(x => String(x.id) === String(se.dataset.schedEdit))); return; }
    const sd = e.target.closest('[data-sched-del]');
    if (sd) { if (confirm('删除这条定时任务？')) { await C.deleteSchedule(+sd.dataset.schedDel); T.cache.schedules = await C.listSchedules(T.classId); renderSchedules(); toast('已删除'); } return; }
    const df = e.target.closest('#log-filter [data-f]');
    if (df) { T.logFilter = df.dataset.f; $$('#log-filter [data-f]').forEach(x => x.classList.toggle('active', x === df)); renderLog(); return; }
    const ub = e.target.closest('[data-unbind]');
    if (ub) {
      if (!confirm('解绑该班级？')) return;
      await C.unbind(+ub.dataset.unbind);
      T.targets = T.targets.filter(x => String(x) !== String(ub.dataset.unbind));
      if (String(T.classId) === String(ub.dataset.unbind)) { const rest = await C.boundClasses(); setClass(rest.length ? rest[0].id : null); }
      refresh(); return;
    }
    const tpl = e.target.closest('[data-tpl]');
    if (tpl) { $('#notice-text').value = tpl.dataset.tpl; updateCharCount(); return; }
    const act = e.target.closest('[data-action]'); if (act) { handleAction(act.dataset.action); }
  });
}

function bindPicks(groupId, apply) {
  const box = $('#' + groupId);
  $$('button', box).forEach(b => b.addEventListener('click', () => {
    $$('button', box).forEach(x => x.classList.toggle('active', x === b));
    apply(b.dataset.v);
    savePrefs(); renderPreview();
  }));
}

function renderDays() {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const box = $('#days-pills');
  box.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(d => '<button class="pill soft' + (T.days.includes(d) ? ' active' : '') + '" data-day="' + d + '">' + names[d] + '</button>').join('');
  $$('[data-day]', box).forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.day;
    const i = T.days.indexOf(d);
    if (i >= 0) T.days.splice(i, 1); else T.days.push(d);
    b.classList.toggle('active'); savePrefs(); renderCta();
  }));
}

async function quickTimer(min, label) {
  const cid = T.classId || T.targets[0];
  if (!cid) { toast('请先选择班级'); return; }
  await TimerC.start(cid, label || '倒计时', Math.round(min * 60));
  toast(label + ' ' + min + ' 分钟已开始，大屏同步显示', true);
}

async function quickBroadcast(text) {
  if (!T.targets.length) { toast('请先选择班级'); return; }
  const base = payload();
  const ok = await sendToTargets(() => Object.assign({ type: 'text', text: text, live: false, tag: '' }, base));
  if (ok) { toast('已广播到大屏', true); refresh(); }
}

async function handleAction(action) {
  switch (action) {
    case 'signout': if (confirm('清除本机身份？清除后需要重新输入姓名和绑定码。')) { Auth.signOut().then(() => location.reload()); } break;
    case 'rename': {
      const n = prompt('你的显示姓名（学生和大屏上会看到）', Auth.name() || '');
      if (n && n.trim()) { Auth.setName(n.trim()); toast('已改为 ' + n.trim(), true); renderAll(); }
      break;
    }
    case 'copy-code': { const c = boundOf(T.classId); if (c) copyText(c.code).then(ok => toast(ok ? '绑定码已复制：' + c.code : '绑定码 ' + c.code, true)); break; }
    case 'create-class': {
      const name = prompt('班级名称（如：三年3班）');
      if (name && name.trim()) { const c = await C.createClass(name.trim()); setClass(c.id); T.targets = [c.id]; toast('已创建 ' + c.name, true); refresh(); }
      break;
    }
    case 'join-class': {
      const code = prompt('输入 6 位绑定码（向该班老师索取）');
      if (code && code.trim()) {
        const c = await C.clsByCode(code.trim());
        if (!c) { toast('绑定码不存在'); return; }
        await C.bind(c.id); setClass(c.id); T.targets = [c.id];
        toast('已加入 ' + c.name, true); refresh();
      }
      break;
    }
    case 'edit-roster': openRosterSheet(); break;
    case 'open-screen': window.open('screen.html', '_blank'); break;
    case 'open-student': window.open('student.html', '_blank'); break;
    case 'open-rollcall': window.open('rollcall.html', '_blank'); break;
  }
}

/* ---------- 启动后的 UI 同步 ---------- */
function syncPrefsUi() {
  const set = (groupId, v) => $$('#' + groupId + ' button').forEach(b => b.classList.toggle('active', b.dataset.v === String(v)));
  set('pick-display', T.display);
  set('pick-times', T.playTimes);
  set('pick-stay', T.staySec);
  set('pick-size', T.fontSize);
  $('#sw-tts').checked = T.tts;
  $('#sw-autoclose').checked = T.autoClose;
  $$('#time-seg button').forEach(b => b.classList.toggle('active', b.dataset.v === T.timing));
  $$('#repeat-seg button').forEach(b => b.classList.toggle('active', b.dataset.v === T.repeat));
  $('#days-pills').hidden = T.repeat !== 'custom';
  $('#sched-box').hidden = T.timing !== 'scheduled';
  renderDays();
}
