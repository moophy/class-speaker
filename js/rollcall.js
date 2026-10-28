/* ============ 班级小喇叭 · 点名与倒计时（云版） ============ */
'use strict';

const R = { classId: null, mode: 'random', cdPreset: 5 };

document.addEventListener('DOMContentLoaded', () => {
  $$('.ic-slot').forEach(s => { s.innerHTML = ICON[s.dataset.icon] || ''; });
  bootRoll();
});

/* 点名页不需要登录：没有班级时输入 6 位绑定码 */
async function bootRoll() {
  let st = {}; try { st = JSON.parse(localStorage.getItem('cs_state') || '{}'); } catch (e) {}
  const uq = ClassBind.urlCode();
  if (uq) {
    try { const c = await ClassBind.resolve(uq); if (c) { st.currentClassId = c.id; localStorage.setItem('cs_state', JSON.stringify(st)); ClassBind.set(c.id); } } catch (e) {}
  }
  const cand = st.currentClassId || ClassBind.get();
  let ok = null;
  if (cand) { try { ok = await C.cls(cand); } catch (e) {} }
  if (ok) { start(); return; }
  ClassBind.ask({
    title: '点名 · 绑定班级',
    hint: '输入老师给的 6 位绑定码，绑定后就能点名与倒计时。',
    onBound: function (c) {
      st.currentClassId = c.id;
      localStorage.setItem('cs_state', JSON.stringify(st));
      start();
    }
  });
}

function start() {
  let st = {}; try { st = JSON.parse(localStorage.getItem('cs_state') || '{}'); } catch (e) {}
  R.classId = st.currentClassId || null;
  bindEvents();
  renderAll();
  setInterval(() => { renderCountdown(); autoTick(); }, 500);
  setInterval(renderAll, 2500);
}

function curClass() { return null; }
function students() { return R._students || []; }

async function renderAll() {
  if (!R.classId) { $('#rc-class').textContent = '未选班级'; $('#roll-history').innerHTML = '<div class="empty">请先在老师端选择班级</div>'; return; }
  try {
    const cls = await C.cls(R.classId); $('#rc-class').textContent = cls ? cls.name : '未选班级';
    R._students = await C.listStudents(R.classId);
    $('#roster-count').textContent = R._students.length + ' 人';
    await renderCountdown(); await renderRollcall(); await renderHistory();
  } catch (e) { console.warn(e); }
}

/* ---------- 倒计时 ---------- */
function renderPresets() {
  const box = $('#cd-presets'); const presets = [1, 3, 5, 10, 15, 25];
  box.innerHTML = presets.map(p => '<button class="pill' + (p === R.cdPreset ? ' active' : '') + '" data-cd="' + p + '">' + p + ' 分钟</button>').join('');
  $$('[data-cd]', box).forEach(b => b.addEventListener('click', () => { R.cdPreset = +b.dataset.cd; $('#cd-custom').value = ''; renderPresets(); }));
}
async function renderCountdown() {
  if (!R.classId) return;
  renderPresets();
  const t = await C.getTimer(R.classId);
  const disp = $('#cd-display'), state = $('#cd-state'), ctl = $('#cd-controls');
  if (!t || t.class_id !== R.classId) {
    disp.textContent = '--:--'; state.textContent = '未开始';
    ctl.innerHTML = '<button class="btn block lg" id="cd-start">开始倒计时</button>';
    $('#cd-start').onclick = startCountdown; return;
  }
  if (t.data.finishedAt != null) {
    disp.textContent = '时间到'; disp.style.color = 'var(--red)'; state.textContent = t.data.label + ' · 已结束';
    ctl.innerHTML = '<button class="btn gray block" id="cd-reset2">重置归零</button>';
    $('#cd-reset2').onclick = async () => { await TimerC.reset(R.classId); renderCountdown(); }; return;
  }
  disp.style.color = ''; disp.textContent = fmtMMSS(TimerC.remainMs(t) / 1000);
  if (t.data.running) {
    state.textContent = t.data.label + ' · 进行中（大屏同步显示）';
    ctl.innerHTML = '<button class="btn ghost grow" id="cd-add">+1分钟</button><button class="btn gray grow" id="cd-pause">暂停</button><button class="btn ghost-danger" id="cd-finish">结束</button>';
    $('#cd-add').onclick = async () => { await TimerC.add(R.classId, 60); renderCountdown(); };
    $('#cd-pause').onclick = async () => { await TimerC.pause(R.classId); renderCountdown(); };
    $('#cd-finish').onclick = async () => { await TimerC.finish(R.classId); renderCountdown(); };
  } else {
    state.textContent = t.data.label + ' · 已暂停';
    ctl.innerHTML = '<button class="btn grow" id="cd-resume">继续</button><button class="btn gray grow" id="cd-reset">重置</button>';
    $('#cd-resume').onclick = async () => { await TimerC.resume(R.classId); renderCountdown(); };
    $('#cd-reset').onclick = async () => { await TimerC.reset(R.classId); renderCountdown(); };
  }
}
async function startCountdown() {
  if (!R.classId) { toast('请先在老师端选择班级'); return; }
  let min = R.cdPreset; const custom = parseFloat($('#cd-custom').value);
  if (!isNaN(custom) && custom > 0) min = custom;
  const label = $('#cd-label').value.trim() || '倒计时';
  await TimerC.start(R.classId, label, Math.round(min * 60));
  toast('倒计时开始，大屏同步显示', true); renderCountdown();
}

/* ---------- 点名 ---------- */
async function startRollcall() {
  const ss = R._students || [];
  if (!ss.length) { toast('请先录入花名册'); openRosterSheet(); return; }
  const order = ss.map(s => s.id);
  if (R.mode === 'random') { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = order[i]; order[i] = order[j]; order[j] = tmp; } }
  await C.createRollcall(R.classId, R.mode, +($('#roll-persec').value || 0), order);
  toast('点名开始，大屏同步显示', true); renderRollcall();
}
async function liveRc() {
  const live = await C.rcLive(R.classId); if (!live || !live.data || !live.data.rcId) return null;
  const rc = await C.getRollcall(live.data.rcId); return rc && rc.data.status === 'live' ? rc : null;
}
async function advance(mark) {
  const rc = await liveRc(); if (!rc) return;
  if (mark) rc.data.results[rc.data.order[rc.data.idx]] = mark;
  rc.data.idx++; rc.data.curStart = Date.now();
  if (rc.data.idx >= rc.data.order.length) { await C.updateRollcall(rc); endRollcall(rc); return; }
  await C.updateRollcall(rc); renderRollcall();
}
async function endRollcall(rc) {
  rc = rc || await liveRc(); if (!rc) return;
  rc.data.status = 'ended'; rc.data.endedAt = Date.now();
  await C.updateRollcall(rc); await C.setRcLive(R.classId, null);
  Beep.play(2); toast('点名结束', true); renderAll();
}
async function autoTick() {
  const rc = await liveRc(); if (!rc || !rc.data.perSec) return;
  const lockTs = +(localStorage.getItem('cs_rc_lock') || 0);
  if (Date.now() - lockTs < 900) return;
  if (Date.now() >= rc.data.curStart + rc.data.perSec * 1000) { localStorage.setItem('cs_rc_lock', String(Date.now())); await advance(undefined); }
}
async function renderRollcall() {
  const rc = await liveRc();
  if (!rc) { $('#roll-active').hidden = true; $('#roll-setup').hidden = false; return; }
  $('#roll-active').hidden = false; $('#roll-setup').hidden = true;
  const ss = R._students || [];
  const cur = ss.find(s => s.id === rc.data.order[rc.data.idx]);
  $('#roll-cur-name').textContent = cur ? cur.name : '--';
  $('#roll-progress').textContent = '第 ' + (rc.data.idx + 1) + ' / ' + rc.data.order.length + ' 人 · ' + (rc.data.mode === 'random' ? '随机' : '顺序') + (rc.data.perSec ? ' · 每人' + rc.data.perSec + '秒' : '');
  const timerEl = $('#roll-per-timer');
  if (rc.data.perSec) { timerEl.hidden = false; const left = Math.max(0, Math.ceil((rc.data.curStart + rc.data.perSec * 1000 - Date.now()) / 1000)); $('#roll-per-sec').textContent = fmtMMSS(left); }
  else timerEl.hidden = true;
  const got = Object.values(rc.data.results || {}).filter(v => v === 'present').length;
  const absent = Object.values(rc.data.results || {}).filter(v => v === 'absent').length;
  $('#roll-results').innerHTML = '<div class="card-label" style="margin-top:6px">实时结果 · 已到 ' + got + ' · 缺勤 ' + absent + '</div>' +
    rc.data.order.map(id => { const s = ss.find(x => x.id === id); if (!s) return ''; const v = rc.data.results[id]; const cls = v === 'present' ? 'tag-chip' : v === 'absent' ? 'tag-chip red' : 'tag-chip blue'; const lbl = v === 'present' ? '到' : v === 'absent' ? '缺勤' : '未点'; return '<span class="' + cls + '" style="margin:2px">' + esc(s.name) + '·' + lbl + '</span>'; }).join('');
}
async function renderHistory() {
  const list = (await C.listRollcalls(R.classId)).filter(r => r.data.status === 'ended');
  $('#roll-history').innerHTML = list.length ? list.map(rc => {
    const got = Object.values(rc.data.results || {}).filter(v => v === 'present').length;
    const absent = Object.values(rc.data.results || {}).filter(v => v === 'absent').length;
    return '<div class="list-item"><div class="grow"><div class="small" style="font-weight:600">' + fmtMDHM(new Date(rc.data.endedAt || rc.created_at).getTime()) + '</div><div class="muted small">应到 ' + rc.data.order.length + ' · 实到 ' + got + ' · 缺勤 ' + absent + '</div></div><span class="tag-chip">' + (rc.data.mode === 'random' ? '随机' : '顺序') + '</span></div>';
  }).join('') : '<div class="empty">暂无点名记录</div>';
}

function openRosterSheet() {
  if (!R.classId) { toast('请先在老师端选择班级'); return; }
  $('#modal-title').textContent = '管理花名册';
  $('#modal-body').innerHTML = '<div class="field"><label>每行一个名字（或用逗号、空格分隔），保存将覆盖原名单</label><textarea id="roster-input" rows="8" placeholder="张小明&#10;李小红&#10;王小雨&#10;刘壮壮">' + esc((R._students || []).map(s => s.name).join('\n')) + '</textarea></div><button class="btn block lg" data-action="save-roster">保存花名册</button>';
  $('#sheet-modal').classList.add('show');
}

function bindEvents() {
  $('#btn-back').addEventListener('click', () => location.href = 'index.html');
  $$('#roll-mode-seg button').forEach(b => b.addEventListener('click', () => { $$('#roll-mode-seg button').forEach(x => x.classList.remove('active')); b.classList.add('active'); R.mode = b.dataset.v; }));
  $('#btn-roster').addEventListener('click', openRosterSheet);
  $('#btn-roll-start').addEventListener('click', startRollcall);
  $('#btn-mark-present').addEventListener('click', () => advance('present'));
  $('#btn-mark-absent').addEventListener('click', () => advance('absent'));
  $('#btn-mark-skip').addEventListener('click', () => advance(undefined));
  $('#btn-roll-end').addEventListener('click', () => { if (confirm('结束点名并保存结果？')) endRollcall(); });
  $$('[data-close]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.close).classList.remove('show')));
  document.addEventListener('click', async e => {
    const a = e.target.closest('[data-action="save-roster"]'); if (!a) return;
    const raw = $('#roster-input').value; const names = raw.split(/[\n,，、\s]+/).map(x => x.trim()).filter(Boolean);
    await C.setStudents(R.classId, names); $('#sheet-modal').classList.remove('show');
    toast('花名册已保存：' + names.length + ' 人', true); renderAll();
  });
}
