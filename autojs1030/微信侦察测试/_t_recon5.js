// 侦察5: 修复版 — 滚动稳定检测 / 弹框签名判定 / 键盘感知验证 / toast过滤 (无脚本toast)
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
function kbOpen() { // 键盘是否开着 (讯飞工具条特征)
    return !!findIt(ocrAll(), function (it) { return it.t.indexOf('语音输入') >= 0 || it.t.indexOf('全屏输入') >= 0 || it.t.indexOf('中/英') >= 0; });
}
var tries = 0;
app.launch(WX); sleep(2500);
while (!isMain() && tries < 5) { back(); sleep(1300); tries++; }
if (!isMain()) { app.launch(WX); sleep(2500); }
if (!isMain()) { console.error('未到微信主界面'); console.log('__DONE__'); exit(); }
if (kbOpen()) { back(); sleep(800); }
var row = findIt(ocrAll(), function (it) { return sim(it.t, '静水流虚') >= 0.7 && it.cy > 0.15 * H() && it.cy < 0.7 * H() && it.l < 0.4 * W(); });
if (!row) { console.error('列表无静水流虚行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
if (kbOpen()) { back(); sleep(800); }
console.log('已进聊天页(键盘关)');

// STEP0: 检查输入框是否有 recon4 残留文本
var leftover = findIt(ocrAll(), function (it) { return it.cy > 0.5 * H() && (it.t.indexOf('消息已收到') >= 0 || it.t.indexOf('13') >= 0 && it.cy > 0.85 * H()); });
console.log('STEP0 输入框残留检查: ' + (leftover ? '"' + leftover.t + '" @cy%=' + (leftover.cy / H()).toFixed(3) : '无'));

// STEP1: 滑动到底 + 滚动稳定检测
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
console.log('STEP1 滚动稳定: "' + (prev ? prev.t.substring(0, 15) : 'null') + '" bottom%=' + (prev ? (prev.b / H()).toFixed(3) : '-'));

// STEP2: 长按目标 → 弹框签名分类 (复制 vs 非文本)
setClip('WXAUTO_SENTINEL_913'); sleep(400);
var copied = null, isNonText = false;
for (var att = 0; att < 3 && !copied && !isNonText; att++) {
    gesture(900, [prev.cx, prev.cy], [prev.cx, prev.cy]); sleep(1100);
    var its = ocrAll();
    var cp = findIt(its, function (it) { return sim(it.t, '复制') >= 0.5 && it.t.length <= 4; });
    var sig = findIt(its, function (it) { return it.t.indexOf('转发') >= 0 || it.t.indexOf('收藏') >= 0 || it.t.indexOf('多选') >= 0 || it.t.indexOf('删除') >= 0; });
    if (cp) {
        click(cp.cx, cp.cy); sleep(900);
        var c = getClip();
        if (c && c !== 'WXAUTO_SENTINEL_913') copied = c;
    } else if (sig) {
        isNonText = true;
        console.log('STEP2 弹框签名: "' + sig.t + '" 无复制项 → 非文本类型(表情大图/图片等) → 提示跳过');
    } else {
        console.warn('STEP2 无弹框 att=' + att + ' (重试)');
    }
}
if (copied) console.log('STEP2 复制成功: "' + copied + '"');
else if (!isNonText) console.warn('STEP2 复制失败(非签名弹框)');

// STEP3: 输入框长按→工具栏粘贴 → 全屏验证 (键盘感知)
setClip('WXPASTE2_确认收到'); sleep(500);
var pasted = false;
for (var att = 0; att < 3 && !pasted; att++) {
    if (kbOpen()) { back(); sleep(800); } // 关键盘回到语音条状态
    gesture(900, [0.468 * W(), 0.9205 * H()], [0.468 * W(), 0.9205 * H()]); sleep(1100);
    var pt = findIt(ocrAll(), function (it) { return it.cy > 0.55 * H() && it.t.length <= 4 && it.t.indexOf('点击') < 0 && sim(it.t, '粘贴') >= 0.5; });
    if (pt) {
        click(pt.cx, pt.cy); sleep(1100);
        var hit = findIt(ocrAll(), function (it) { return it.cy > 0.4 * H() && (it.t.indexOf('WXPASTE2') >= 0 || it.t.indexOf('确认收到') >= 0); });
        if (hit) { pasted = true; console.log('STEP3 粘贴验证 ✓ "' + hit.t + '" @cy%=' + (hit.cy / H()).toFixed(3)); }
        else console.warn('STEP3 全屏未见粘贴文本 att=' + att);
    } else {
        console.warn('STEP3 未找到工具栏"粘贴" att=' + att);
    }
}
if (!pasted) console.error('STEP3 粘贴链路失败(3次)');
console.log('__DONE__');
