/* ============ 班级小喇叭 · 云数据层（数据库 + 存储 + 认证） ============ */
'use strict';

const cloud = WorkBuddyCloud.createWorkBuddyCloud({
  endpoint: PUBLIC_CONFIG.endpoint,
  oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
  publishableKey: PUBLIC_CONFIG.publishableKey,
});
const DB = cloud.database;
const ST = cloud.storage;
const AUTH = cloud.auth;

function unwrap(r) { if (r && r.error) throw r.error; return r ? r.data : null; }
function jval(v) { return v == null ? '' : String(v); }

/* ---------- 认证（仅老师端：姓名登录，无需密码；其他端不登录） ---------- */
const TKEY = 'cs_teacher';          // 本地身份 { id, name }
const NKEY = 'cs_teacher_name';     // 显示名

const Auth = {
  session: null, ready: false, _cbs: [], local: null,
  async init() {
    if (this.ready) return;
    // 只认本机身份：姓名登录，不接微信、不建云端会话
    try { this.local = JSON.parse(localStorage.getItem(TKEY) || 'null'); } catch (e) { this.local = null; }
    this.ready = true;
    this._cbs.forEach(cb => cb(null));
  },
  onSession(cb) { this._cbs.push(cb); if (this.ready) cb(null); },
  isWechat() { return false; },
  isLogged() { return !!(this.local && this.local.id); },
  uid() {
    return (this.local && this.local.id) || null;
  },
  name() {
    let n = ''; try { n = localStorage.getItem(NKEY) || ''; } catch (e) {}
    if (n) return n;
    return (this.local && this.local.name) || '老师';
  },
  setName(n) { n = String(n || '').trim(); if (!n) return; try { localStorage.setItem(NKEY, n); } catch (e) {} },
  /* 姓名登录：仅在本机记住一个身份（其他端本来也不需要登录） */
  signInLocal(name) {
    const n = String(name || '').trim() || '老师';
    const id = (this.local && this.local.id) || ('t_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    this.local = { id: id, name: n };
    try { localStorage.setItem(TKEY, JSON.stringify(this.local)); localStorage.setItem(NKEY, n); } catch (e) {}
    this._cbs.forEach(cb => cb(this.session));
    return this.local;
  },
  async signOut() {
    try { await AUTH.signOut(); } catch (e) {}
    this.session = null; this.local = null;
    try { localStorage.removeItem(TKEY); localStorage.removeItem(NKEY); } catch (e) {}
    this._cbs.forEach(cb => cb(null));
  },
  showLoginOverlay() {
    if ($('#cs-login-overlay')) return;
    const ov = document.createElement('div'); ov.id = 'cs-login-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:1000;background:radial-gradient(900px 600px at 50% 30%,#123A2C 0%,#08110D 78%);display:flex;align-items:center;justify-content:center;padding:22px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:24px;padding:30px 24px 22px;width:min(400px,94vw);text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.42)">' +
        '<div style="width:56px;height:56px;border-radius:18px;margin:0 auto 14px;background:linear-gradient(135deg,#00C97F,#00A86B);display:flex;align-items:center;justify-content:center">' +
          '<span style="color:#fff;font-size:26px;font-weight:800">喇</span></div>' +
        '<div style="font-size:22px;font-weight:800;color:#111;letter-spacing:-.3px">班级小喇叭</div>' +
        '<p style="color:#8A9490;font-size:13px;margin:6px 0 20px">老师端 · 输入姓名即可使用</p>' +
        '<input id="cs-login-name" maxlength="12" placeholder="你的姓名，如：王老师" ' +
          'style="width:100%;border:1.5px solid #E6EAE9;border-radius:12px;padding:13px;font-size:16px;text-align:center;box-sizing:border-box">' +
        '<button id="cs-login-go" class="btn block lg" style="margin-top:12px">进入</button>' +
        '<p style="color:#9AA3A0;font-size:12px;line-height:1.65;margin:14px 0 0">' +
          '姓名只用来在大屏和记录里显示是谁发的，不需要密码。<br>进入后输入班级绑定码，就能收发通知。</p>' +
      '</div>';
    document.body.appendChild(ov);
    const go = () => {
      const n = ($('#cs-login-name').value || '').trim();
      if (!n) { toast('请输入姓名'); return; }
      Auth.signInLocal(n); Auth.hideLoginOverlay(); Auth._cbs.forEach(cb => cb(null));
    };
    $('#cs-login-go').onclick = go;
    $('#cs-login-name').onkeydown = e => { if (e.key === 'Enter') go(); };
    setTimeout(() => { const i = $('#cs-login-name'); if (i) i.focus(); }, 60);
  },
  hideLoginOverlay() { const ov = $('#cs-login-overlay'); if (ov) ov.remove(); },
  gate(start) {
    Auth.init().then(() => {
      if (Auth.isLogged()) { Auth.hideLoginOverlay(); start(); return; }
      let started = false;
      const go = () => { if (started) return; started = true; Auth.hideLoginOverlay(); start(); };
      Auth.showLoginOverlay();
      const t = setInterval(() => { if (Auth.isLogged()) { clearInterval(t); go(); } }, 400);
    }).catch(e => { console.error(e); Auth.showLoginOverlay(); });
  }
};

/* ---------- 媒体（图片 / 语音）：存数据库，无需登录即可读取 ---------- */
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', webm: 'audio/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', json: 'application/octet-stream' };

const Store = {
  _cache: new Map(),
  _b64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result || '').split(',')[1] || '');
      fr.onerror = () => rej(new Error('读取文件失败'));
      fr.readAsDataURL(blob);
    });
  },
  /* 图片压到 1600px 内的 JPEG，图片/语音都走这条路 */
  async _shrink(blob) {
    if (!/^image\//.test(blob.type || '') || /gif/.test(blob.type || '')) return blob;
    try {
      const bmp = await createImageBitmap(blob);
      const max = 1600, sc = Math.min(1, max / Math.max(bmp.width || 1, bmp.height || 1));
      if (sc >= 1 && blob.size < 500 * 1024) return blob;
      const cv = document.createElement('canvas');
      cv.width = Math.round((bmp.width || 1) * sc); cv.height = Math.round((bmp.height || 1) * sc);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const out = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.82));
      return (out && out.size < blob.size) ? out : blob;
    } catch (e) { return blob; }
  },
  async upload(blob, extOrKind) {
    const b = await this._shrink(blob);
    const ext = String(extOrKind || '').toLowerCase();
    const mime = b.type || MIME_BY_EXT[ext] || 'application/octet-stream';
    const kind = /^image\//.test(mime) ? 'image' : /^audio\//.test(mime) ? 'voice' : 'file';
    const k = Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    const payload = await this._b64(b);
    const r = await DB.from('cs_media').insert({ k: k, kind: kind, mime: mime, payload: payload }).select('id').single();
    unwrap(r);
    return 'media:' + k;
  },
  async signedUrl(path) {
    if (!path) return null;
    if (this._cache.has(path)) return this._cache.get(path);
    let url = null;
    if (String(path).indexOf('media:') === 0) {
      const r = await DB.from('cs_media').select('mime,payload').eq('k', String(path).slice(6)).maybeSingle();
      const row = unwrap(r);
      if (row && row.payload) {
        const bin = atob(row.payload);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        url = URL.createObjectURL(new Blob([arr], { type: row.mime || 'application/octet-stream' }));
      }
    } else {
      // 兼容早期存在云存储里的媒体
      try {
        const r = await ST.createSignedUrl(path, 3000);
        url = (r && !r.error && r.data && (r.data.signedUrl || r.data.url || r.data)) || null;
      } catch (e) { url = null; }
    }
    if (url) this._cache.set(path, url);
    return url || null;
  }
};

/* ---------- 数据模型（全部异步） ---------- */
const C = {
  async listClasses() { const r = await DB.from('cs_events').select('*').eq('kind', 'class').order('created_at', { ascending: true }); return unwrap(r) || []; },
  async cls(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },
  async clsByCode(code) { const r = await DB.from('cs_events').select('*').eq('kind', 'class').eq('code', code).maybeSingle(); return unwrap(r) || null; },
  async createClass(name) {
    name = String(name || '').trim(); if (!name) throw new Error('请填写班级名称');
    const all = await this.listClasses();
    let code; do { code = String(Math.floor(100000 + Math.random() * 900000)); } while (all.some(c => c.code === code));
    const r = await DB.from('cs_events').insert({ kind: 'class', code: code, name: name }).select().single();
    const c = unwrap(r);
    const presets = [
      { name: '放学提醒', text: '放学了：请关窗、关灯、关电脑，值日生留下打扫。', time: '16:50', repeat: 'weekdays', enabled: true },
      { name: '眼保健操(上午)', text: '眼保健操时间到，请闭上眼睛，保持安静，开始做眼保健操。', time: '09:55', repeat: 'weekdays', enabled: true },
      { name: '眼保健操(下午)', text: '眼保健操时间到，请闭上眼睛，保持安静，开始做眼保健操。', time: '14:35', repeat: 'weekdays', enabled: true },
    ];
    for (const s of presets) { await DB.from('cs_events').insert({ kind: 'schedule', class_id: c.id, name: s.name, data: s }); }
    await this.bind(c.id);
    return c;
  },
  async bind(classId) {
    const uid = Auth.uid(); if (!uid) return;
    const ex = await DB.from('cs_events').select('id').eq('kind', 'binding').eq('class_id', classId).filter('data->>teacher_uid', 'eq', uid).maybeSingle();
    if (unwrap(ex)) return;
    await DB.from('cs_events').insert({ kind: 'binding', class_id: classId, data: { teacher_uid: uid, name: Auth.name() } });
  },
  async unbind(classId) { const uid = Auth.uid(); await DB.from('cs_events').delete().eq('kind', 'binding').eq('class_id', classId).filter('data->>teacher_uid', 'eq', uid); },
  async boundClasses() {
    const uid = Auth.uid(); if (!uid) return [];
    const r = await DB.from('cs_events').select('*').eq('kind', 'binding');
    const ids = (unwrap(r) || []).filter(b => b.data && b.data.teacher_uid === uid).map(b => b.class_id);
    if (!ids.length) return [];
    const rc = await DB.from('cs_events').select('*').eq('kind', 'class').in('id', ids).order('created_at', { ascending: true });
    return unwrap(rc) || [];
  },
  async listStudents(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'student').eq('class_id', classId).order('created_at', { ascending: true }); return unwrap(r) || []; },
  async setStudents(classId, names) {
    await DB.from('cs_events').delete().eq('kind', 'student').eq('class_id', classId);
    const rows = names.map((n, i) => String(n || '').trim()).filter(Boolean).map((n, i) => ({ kind: 'student', class_id: classId, name: n, data: { seat: i + 1 } }));
    if (rows.length) await DB.from('cs_events').insert(rows);
  },
  async listMessages(classId, limit) { const r = await DB.from('cs_events').select('*').eq('kind', 'message').eq('class_id', classId).order('created_at', { ascending: false }).limit(limit || 50); return unwrap(r) || []; },
  async addMessage(p) {
    const r = await DB.from('cs_events').insert({
      kind: 'message', class_id: p.classId, name: p.sender || Auth.name(),
      data: {
        type: p.type, tag: p.tag || '', text: p.text || '', mediaPath: p.mediaPath || null,
        duration: p.duration || 0, live: !!p.live,
        readTimes: p.readTimes || 1,
        displaySec: p.displaySec == null ? 15 : p.displaySec,
        displayMode: p.displayMode || 'full',
        fontSize: p.fontSize || 'md',
        tts: p.tts === false ? false : true,
        ts: Date.now()
      }
    }).select().single();
    return unwrap(r);
  },
  async listSchedules(classId) {
    const r = await DB.from('cs_events').select('*').eq('kind', 'schedule').eq('class_id', classId).order('created_at', { ascending: true });
    const rows = unwrap(r) || [];
    rows.sort((a, b) => String((a.data || {}).time || '').localeCompare(String((b.data || {}).time || '')));
    return rows;
  },
  async listAllSchedules() { const r = await DB.from('cs_events').select('*').eq('kind', 'schedule'); return unwrap(r) || []; },
  async saveSchedule(s) {
    if (s.id) { const r = await DB.from('cs_events').update({ name: s.name, data: s.data }).eq('id', s.id).select().single(); return unwrap(r); }
    const r = await DB.from('cs_events').insert({ kind: 'schedule', class_id: s.classId, name: s.name, data: s.data }).select().single(); return unwrap(r);
  },
  async deleteSchedule(id) { await DB.from('cs_events').delete().eq('id', id); },
  async setScheduleEnabled(id, enabled) {
    const row = await this._get(id); if (!row) return;
    const data = Object.assign({}, row.data || {}, { enabled: enabled });
    await DB.from('cs_events').update({ data: data }).eq('id', id);
  },
  async claimSchedule(id, key) {
    key = String(key);
    try {
      const r = await DB.from('cs_events').update({ last_run_key: key }).eq('id', id)
        .or('last_run_key.is.null,last_run_key.neq.' + key).select('id');
      const d = unwrap(r); return !!(d && d.length);
    } catch (e) {
      // 退路：分两步抢占
      let d = unwrap(await DB.from('cs_events').update({ last_run_key: key }).eq('id', id).is('last_run_key', null).select('id'));
      if (d && d.length) return true;
      d = unwrap(await DB.from('cs_events').update({ last_run_key: key }).eq('id', id).neq('last_run_key', key).select('id'));
      return !!(d && d.length);
    }
  },
  async _get(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },

  async receiptsOfClass(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'receipt').eq('class_id', classId); return unwrap(r) || []; },
  /* 注意：网关对 jsonb ->> 的服务端过滤不可靠（会返回空），这里统一取回后在本地筛 */
  async receiptsOf(msgId) {
    const r = await DB.from('cs_events').select('*').eq('kind', 'receipt');
    return (unwrap(r) || []).filter(x => x.data && String(x.data.msg_id) === String(msgId));
  },
  async addReceipt(msgId, classId, student) {
    const ex = await this.receiptsOf(msgId);
    if (ex.some(r => r.data && String(r.data.student_id) === String(student.id))) return false;
    const payload = { msg_id: jval(msgId), student_id: jval(student.id), name: student.name, ts: Date.now() };
    if (student.collective) payload.collective = true;   // 整班一次确认（大屏上点的）
    const r = await DB.from('cs_events').insert({ kind: 'receipt', class_id: classId, data: payload }).select().single();
    return unwrap(r) || true;
  },

  async createRollcall(classId, mode, perSec, order) {
    const r = await DB.from('cs_events').insert({ kind: 'rollcall', class_id: classId, data: { mode: mode, perSec: perSec, order: order, idx: 0, results: {}, status: 'live', startedAt: Date.now(), curStart: Date.now(), endedAt: null } }).select().single();
    const rc = unwrap(r); await this.setRcLive(classId, rc.id); return rc;
  },
  async updateRollcall(rc) { await DB.from('cs_events').update({ data: rc.data }).eq('id', rc.id); },
  async getRollcall(id) { const r = await DB.from('cs_events').select('*').eq('id', id).maybeSingle(); return unwrap(r) || null; },
  async listRollcalls(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'rollcall').eq('class_id', classId).order('created_at', { ascending: false }).limit(15); return unwrap(r) || []; },
  async setRcLive(classId, rcId) {
    const ex = await this.rcLive(classId);
    if (!rcId) { await DB.from('cs_events').delete().eq('kind', 'rclive').eq('class_id', classId); return; }
    if (ex) { unwrap(await DB.from('cs_events').update({ data: { rcId: rcId } }).eq('id', ex.id)); return; }
    unwrap(await DB.from('cs_events').insert({ kind: 'rclive', class_id: classId, data: { rcId: rcId } }).select('id'));
  },
  async rcLive(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'rclive').eq('class_id', classId).maybeSingle(); return unwrap(r) || null; },

  async getTimer(classId) { const r = await DB.from('cs_events').select('*').eq('kind', 'timer').eq('class_id', classId).maybeSingle(); return unwrap(r) || null; },
  async setTimer(classId, data) {
    const ex = await this.getTimer(classId);
    if (ex) { unwrap(await DB.from('cs_events').update({ data: data }).eq('id', ex.id)); return; }
    unwrap(await DB.from('cs_events').insert({ kind: 'timer', class_id: classId, data: data }).select('id'));
  },
  async clearTimer(classId) { await DB.from('cs_events').delete().eq('kind', 'timer').eq('class_id', classId); },

  /* ---------- 单行状态（presence / draw）：先查后写，表里没有唯一约束 ---------- */
  async _one(kind, classId) {
    const r = await DB.from('cs_events').select('*').eq('kind', kind).eq('class_id', classId).limit(1);
    const rows = unwrap(r) || [];
    return rows[0] || null;
  },
  async _setOne(kind, classId, data) {
    const ex = await this._one(kind, classId);
    if (ex) { unwrap(await DB.from('cs_events').update({ data: data }).eq('id', ex.id)); return ex.id; }
    const r = await DB.from('cs_events').insert({ kind: kind, class_id: classId, data: data }).select('id').single();
    const row = unwrap(r); return row && row.id;
  },

  /* 大屏在线心跳：data.screen = 时间戳，老师端据此判断班级是否在线 */
  async setPresence(classId, patch) {
    const ex = await this._one('presence', classId);
    const data = Object.assign({}, (ex && ex.data) || {}, patch);
    return this._setOne('presence', classId, data);
  },
  async listPresence() { const r = await DB.from('cs_events').select('*').eq('kind', 'presence'); return unwrap(r) || []; },

  /* 抽人回答：status = running | done */
  async drawState(classId) { return this._one('draw', classId); },
  async setDraw(classId, data) { return this._setOne('draw', classId, data); },

  /* ---------- 已发送记录：删除 / 过期清理 ---------- */
  async deleteMessage(id) {
    try { await DB.from('cs_events').delete().eq('kind', 'receipt').filter('data->>msg_id', 'eq', jval(id)); } catch (e) {}
    await DB.from('cs_events').delete().eq('id', id);
  },
  /* 只清「已发送记录」，定时任务（kind=schedule）不动 */
  async purgeMessages(classIds, hours) {
    const cutoff = Date.now() - (hours || 24) * 3600 * 1000;
    let n = 0;
    for (const cid of classIds) {
      let rows = [];
      try { rows = unwrap(await DB.from('cs_events').select('*').eq('kind', 'message').eq('class_id', cid).order('created_at', { ascending: false }).limit(300)) || []; } catch (e) { continue; }
      for (const m of rows) {
        const ts = m.created_at ? new Date(m.created_at).getTime() : ((m.data && m.data.ts) || 0);
        if (ts && ts < cutoff) { try { await this.deleteMessage(m.id); n++; } catch (e) {} }
      }
    }
    return n;
  },
};

/* ---------- 倒计时操作 ---------- */
const TimerC = {
  async start(classId, label, totalSec) { await C.setTimer(classId, { label: label || '倒计时', totalSec: totalSec, running: true, endsAt: Date.now() + totalSec * 1000, remainMs: null, finishedAt: null }); },
  async pause(classId) { const t = await C.getTimer(classId); if (!t || !t.data.running || t.data.finishedAt != null) return; t.data.remainMs = Math.max(0, t.data.endsAt - Date.now()); t.data.running = false; await C.setTimer(classId, t.data); },
  async resume(classId) { const t = await C.getTimer(classId); if (!t || t.data.running || t.data.finishedAt != null) return; t.data.endsAt = Date.now() + (t.data.remainMs || 0); t.data.running = true; await C.setTimer(classId, t.data); },
  async add(classId, sec) { const t = await C.getTimer(classId); if (!t || t.data.finishedAt != null) return; if (t.data.running) { t.data.endsAt += sec * 1000; } else { t.data.remainMs = (t.data.remainMs || 0) + sec * 1000; } t.data.totalSec += sec; await C.setTimer(classId, t.data); },
  async finish(classId) { const t = await C.getTimer(classId); if (!t) return; t.data.running = false; t.data.remainMs = 0; t.data.finishedAt = Date.now(); await C.setTimer(classId, t.data); },
  async reset(classId) { await C.clearTimer(classId); },
  remainMs(t) { if (!t || !t.data) return 0; if (t.data.finishedAt != null) return 0; if (t.data.running) return Math.max(0, t.data.endsAt - Date.now()); return t.data.remainMs || 0; }
};

/* ---------- 定时通知检查器（在大屏页常驻运行） ---------- */
const Checker = {
  start(onFire) {
    const tick = () => this.tick(onFire);
    setInterval(tick, 8000); setTimeout(tick, 1500);
  },
  async tick(onFire) {
    try {
      const now = new Date();
      const hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
      const day = now.getDay();
      const tk = todayKey(now);
      const all = await C.listAllSchedules();
      for (const row of all) {
        const s = row.data || {}; if (!s.enabled || s.time !== hm) continue;
        const key = tk.replace(/-/g, '') + 'T' + hm.replace(':', '') + 'S' + row.id;
        if (row.last_run_key === key) continue;
        if (s.repeat === 'weekdays' && (day === 0 || day === 6)) continue;
        if (s.repeat === 'custom' && !(s.days || []).includes(day)) continue;
        if (s.repeat === 'once' && s.fireDate && s.fireDate !== tk) continue;
        const claimed = await C.claimSchedule(row.id, key);
        if (!claimed) continue;
        const m = await C.addMessage({
          classId: row.class_id, type: 'text', tag: row.name, text: s.text, sender: '定时广播', live: false,
          readTimes: s.readTimes || 2,
          displaySec: s.displaySec == null ? 30 : s.displaySec,
          displayMode: s.displayMode || 'full',
          fontSize: s.fontSize || 'md',
          tts: s.tts === false ? false : true,
        });
        if (onFire) { try { onFire(m, row); } catch (e) {} }
      }
    } catch (e) { console.warn('checker', e); }
  }
};
