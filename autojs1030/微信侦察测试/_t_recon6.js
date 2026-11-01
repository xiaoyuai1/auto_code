// 侦察6: 像素带扫描定位 OCR 隐形气泡(emoji/图片) + 合并项容错的复制匹配 (不发消息)
console.log("__START__");
var WX = 'com.tencent.mm';
auto();
if (!images.requestScreenCapture()) { console.error('截屏失败'); exit(); }
sleep(400);
function W() { return device.width; } function H() { return device.height; }
var TOAST_RE = /正在访问剪贴板|已复制|已停止运行|已粘贴/;
function ocrAll() {
    var img = images.captureScreen();
    if (!img) return [];
    var rs; try { rs = ocr.detect(img); } catch (e) { rs = []; }
    var out = [];
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i], t = String(r.label || r.text || '').trim(), b = r.bounds;
        if (!t || !b || TOAST_RE.test(t)) continue;
        out.push({ t: t, l: b.left, top: b.top, r: b.right, b: b.bottom, cx: b.centerX(), cy: b.centerY(), conf: r.confidence || 0 });
    }
    return out;
}
function findIt(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }
function sim(a, b) {
    if (!a || !b) return 0;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 1;
    var inter = 0, union = 0, k, seen = {};
    for (k = 0; k < a.length; k++) if (!seen[a[k]]) { seen[a[k]] = 1; union++; if (b.indexOf(a[k]) >= 0) inter++; }
    for (k = 0; k < b.length; k++) if (!seen[b[k]]) { seen[b[k]] = 1; union++; }
    return union ? inter / union : 0;
}
function isMain() {
    var items = ocrAll(); var hits = 0;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy > 0.9 * H() && (it.t.indexOf('发现') >= 0 || it.t === '我' || it.t.indexOf('微信') >= 0
            || (it.t.indexOf('通') >= 0 && it.t.indexOf('录') >= 0))) hits++;
        if (it.cy < 0.09 * H() && it.cy > 0.03 * H() && it.t.indexOf('微信') >= 0) hits++;
    }
    return hits >= 2;
}
function kbOpen() {
    return !!findIt(ocrAll(), function (it) { return it.t.indexOf('语音输入') >= 0 || it.t.indexOf('全屏输入') >= 0 || it.t.indexOf('中/英') >= 0; });
}
var tries = 0;
app.launch(WX); sleep(2500);
while (!isMain() && tries < 5) { back(); sleep(1300); tries++; }
if (!isMain()) { app.launch(WX); sleep(2500); tries = 0; while (!isMain() && tries < 3) { back(); sleep(1300); tries++; } }
if (!isMain()) { console.error('未到微信主界面'); console.log('__DONE__'); exit(); }
if (kbOpen()) { back(); sleep(800); }
var row = findIt(ocrAll(), function (it) { return sim(it.t, '静水流虚') >= 0.7 && it.cy > 0.15 * H() && it.cy < 0.7 * H() && it.l < 0.4 * W(); });
if (!row) { console.error('列表无静水流虚行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
if (kbOpen()) { back(); sleep(800); }
console.log('已进聊天页');

// STEP1: 滑动到底 + 稳定
function bottomLeft() {
    var items = ocrAll(); var best = null;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy < 0.10 * H() || it.cy > 0.90 * H()) continue;
        var lp = it.l / W();
        if (lp >= 0.38) continue;
        if (/^\d{1,2}:\d{2}$/.test(it.t)) continue;
        if (!best || it.b > best.b) best = it;
    }
    return best;
}
swipe(0.5 * W(), 0.82 * H(), 0.5 * W(), 0.32 * H(), 350);
var prev = null, stable = 0;
for (var s = 0; s < 5 && stable < 2; s++) {
    sleep(900);
    var cur = bottomLeft();
    if (cur && prev && cur.t === prev.t && Math.abs(cur.b - prev.b) < 8) stable++;
    else stable = 0;
    prev = cur;
}
console.log('STEP1 稳定后最底文本: "' + (prev ? prev.t : 'null') + '" bottom%=' + (prev ? (prev.b / H()).toFixed(3) : '-'));

// STEP2: 像素带扫描 (最后文本之下, x=0.21W 列, 与同行 0.6W 背景比对)
var img = images.captureScreen();
var xB = Math.round(0.21 * W()), xBG = Math.round(0.6 * W());
function dist(y1, y2) {
    var c1 = images.pixel(img, xB, y1), c2 = images.pixel(img, xBG, y2);
    var dr = ((c1 >> 16) & 255) - ((c2 >> 16) & 255);
    var dg = ((c1 >> 8) & 255) - ((c2 >> 8) & 255);
    var db = (c1 & 255) - (c2 & 255);
    return Math.sqrt(dr * dr + dg * dg + db * db);
}
var yStart = (prev ? prev.b : 0.1 * H()) + 24, yEnd = Math.round(0.90 * H());
var bands = [], inBand = false, bs = 0, gap = 0;
for (var y = yStart; y <= yEnd; y += 6) {
    var d = dist(y, y);
    if (d > 28) {
        if (!inBand) { inBand = true; bs = y; }
        gap = 0;
    } else if (inBand) {
        gap += 6;
        if (gap > 24) { // 带结束
            var be = y - gap;
            if (be - bs >= 60) bands.push({ top: bs, b: be });
            inBand = false; gap = 0;
        }
    }
}
if (inBand) { var be2 = yEnd; if (be2 - bs >= 60) bands.push({ top: bs, b: be2 }); }
console.log('STEP2 隐形带数量: ' + bands.length);
for (var bi = 0; bi < bands.length; bi++) console.log('  带' + bi + ': ' + bands[bi].top + '-' + bands[bi].b + ' (' + (bands[bi].top / H()).toFixed(3) + '-' + (bands[bi].b / H()).toFixed(3) + ')');

// STEP3: 最底带 = 最新消息 → 长按 → 弹框裁判
if (bands.length === 0) { console.log('结论: 最新消息即最后文本(无隐形气泡)'); console.log('__DONE__'); exit(); }
var tgt = bands[bands.length - 1];
var ty = Math.round((tgt.top + tgt.b) / 2);
setClip('WXAUTO_SENTINEL_913'); sleep(400);
var copied = null, nonText = false;
for (var att = 0; att < 3 && !copied && !nonText; att++) {
    gesture(900, [xB, ty], [xB, ty]); sleep(1100);
    var its = ocrAll();
    var cp = findIt(its, function (it) { return it.t.indexOf('复制') >= 0; });
    var sig = findIt(its, function (it) { return it.t.indexOf('转发') >= 0 || it.t.indexOf('收藏') >= 0 || it.t.indexOf('多选') >= 0; });
    if (cp) {
        // 合并项容错: "复制 转发" 合并时点左~12% 处
        var px = cp.t.length > 6 || cp.t.indexOf('转发') >= 0 ? cp.l + 0.12 * (cp.r - cp.l) : cp.cx;
        console.log('STEP3 弹框"复制"命中 att=' + att + ' 项="' + cp.t + '" 点击@' + Math.round(px) + ',' + Math.round(cp.cy));
        click(px, cp.cy); sleep(900);
        var c = getClip();
        if (c && c !== 'WXAUTO_SENTINEL_913') copied = c;
    } else if (sig) {
        nonText = true;
        console.log('STEP3 弹框签名="' + sig.t + '" 无复制 → 图片类 → 提示跳过');
    } else console.warn('STEP3 无弹框 att=' + att);
}
if (copied) console.log('=== 最新消息精确原文(剪贴板) === "' + copied + '"');
else if (!nonText) console.warn('STEP3 未定型(重试耗尽)');
console.log('__DONE__');
