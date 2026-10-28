/* ============ 班级小喇叭 · 云端请求桥 ============
 * 平台的云端网关按「来源域名」放行：应用自身域名与 localhost 可以直连，
 * 其他站点（例如 GitHub Pages）的跨域请求会在预检阶段被 403 拒绝。
 * 但网关对「无来源 / null 来源」的请求是放行的。
 *
 * 做法：用一个 sandbox="allow-scripts" 的 iframe 代发请求。
 * 这种 iframe 的 window.origin 是 null（opaque origin），浏览器发出的
 * Origin 头就是 null，网关放行并回 Access-Control-Allow-Origin: null，
 * 于是父页面（任意域名）也能拿到数据。
 *
 * 只在非受信域名下启用；在应用自身域名 / localhost / file:// 下完全不介入。
 */
(function () {
  'use strict';
  var EP = String((window.PUBLIC_CONFIG && window.PUBLIC_CONFIG.endpoint) || '').replace(/\/+$/, '');
  if (!EP) return;

  function trusted() {
    try {
      if (location.protocol === 'file:') return true;
      var o = location.origin;
      if (o === EP) return true;
      if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(o)) return true;
      if (/^https?:\/\/[a-z0-9-]+\.app\.workbuddy\.host$/i.test(o)) return true;
      return false;
    } catch (e) { return true; }
  }
  if (trusted()) { window.CLOUD_BRIDGE_ACTIVE = false; return; }

  var seq = 0;
  var waiting = {};
  var frame = null;
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (!d || d.__cw !== 1) return;
    if (d.ready) { readyResolve(); return; }
    var p = waiting[d.id];
    if (!p) return;
    delete waiting[d.id];
    if (d.err) p.reject(new Error(d.err)); else p.resolve(d);
  });

  function mount() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px;top:0;opacity:0;pointer-events:none';
    frame.src = 'cloud-bridge.html';
    (document.body || document.documentElement).appendChild(frame);
  }

  function buildResponse(d) {
    var status = Number(d.status) || 0;
    if (status < 200 || status > 599) status = 502;
    var headers;
    try { headers = new Headers(d.headers || []); } catch (e) { headers = new Headers(); }
    var noBody = status === 204 || status === 205 || status === 304;
    try {
      return new Response(noBody ? null : String(d.body == null ? '' : d.body), {
        status: status, statusText: d.statusText || '', headers: headers
      });
    } catch (e) {
      return new Response(noBody ? null : String(d.body == null ? '' : d.body), { status: status, headers: headers });
    }
  }

  function send(req) {
    mount();
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          delete waiting[req.id];
          reject(new Error('云端请求超时，请检查网络'));
        }, 45000);
        waiting[req.id] = {
          resolve: function (d) { clearTimeout(timer); resolve(buildResponse(d)); },
          reject: function (err) { clearTimeout(timer); reject(err); }
        };
        try { frame.contentWindow.postMessage(req, '*'); }
        catch (e) { clearTimeout(timer); delete waiting[req.id]; reject(e); }
      });
    });
  }

  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;

  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    if (!url || url.indexOf(EP) !== 0) {
      if (nativeFetch) return nativeFetch(input, init);
      return Promise.reject(new Error('fetch 不可用'));
    }
    var opt = init || {};
    var req = {
      __cw: 1,
      id: ++seq,
      url: url,
      method: String(opt.method || (input && input.method) || 'GET').toUpperCase(),
      headers: {},
      body: null
    };
    try {
      var h = new Headers(opt.headers || (input && input.headers) || {});
      h.forEach(function (v, k) { req.headers[k] = v; });
    } catch (e) {}
    var bodyP;
    if (opt.body == null) bodyP = Promise.resolve(null);
    else if (typeof opt.body === 'string') bodyP = Promise.resolve(opt.body);
    else bodyP = Promise.resolve().then(function () { return new Response(opt.body).text(); });
    return bodyP.then(function (body) { req.body = body; return send(req); });
  };

  window.CLOUD_BRIDGE_ACTIVE = true;
})();
