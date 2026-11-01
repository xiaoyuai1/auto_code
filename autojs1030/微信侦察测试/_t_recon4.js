// 侦察4: 验证 ① 图片/表情消息的跳过路径(弹框无"复制") ② 输入框长按→工具栏"粘贴" (不发消息)
console.log("__START__");
var WX = 'com.tencent.mm';
auto();
if (!images.requestScreenCapture()) { console.error('截屏失败'); exit(); }
sleep(400);
function W() { return device.width; } function H() { return device.height; }
function ocrAll() {
    var img = images.captureScreen();
    if (!img) return [];
    var rs; try { rs = ocr.detect(img); } catch (e) { rs = []; }
    var out = [];
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i], t = String(r.label || r.text || '').trim(), b = r.bounds;
        if (!t || !b) continue;
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
    var items = ocrAll();
    var hits = 0;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy > 0.9 * H() && (it.t.indexOf('发现') >= 0 || it.t === '我' || it.t.indexOf('微信') >= 0
            || (it.t.indexOf('通') >= 0 && it.t.indexOf('录') >= 0))) hits++;
        if (it.cy < 0.09 * H() && it.cy > 0.03 * H() && it.t.indexOf('微信') >= 0) hits++;
    }
    return hits >= 2;
}
var tries = 0;
while (!isMain() && tries < 5) { back(); sleep(1300); tries++; }
if (!isMain()) { console.error('未到主界面'); console.log('__DONE__'); exit(); }
var row = findIt(ocrAll(), function (it) { return sim(it.t, '静水流虚') >= 0.7 && it.cy > 0.15 * H() && it.cy < 0.7 * H() && it.l < 0.4 * W(); });
if (!row) { console.error('列表无静水流虚行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
console.log('已进聊天页');
swipe(0.5 * W(), 0.82 * H(), 0.5 * W(), 0.32 * H(), 350); sleep(1000);

// TEST A: 最新左侧气泡定位 + 长按找"复制" (预期: 图片消息无复制 → 跳过路径)
var items = ocrAll();
var best = null;
for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.cy < 0.10 * H() || it.cy > 0.90 * H()) continue;
    var lp = it.l / W();
    if (lp >= 0.38) continue;
    if (/^\d{1,2}:\d{2}$/.test(it.t)) continue;
    if (lp > 0.38 && it.t.length <= 6) continue;
    if (!best || it.b > best.b) best = it;
}
if (best) {
    console.log('TEST-A 最新左气泡: "' + best.t.substring(0, 20) + '" @bottom%=' + (best.b / H()).toFixed(3));
    setClip('WXAUTO_SENTINEL_913'); sleep(400);
    var gotCopy = null;
    for (var att = 0; att < 2 && !gotCopy; att++) {
        gesture(900, [best.cx, best.cy], [best.cx, best.cy]); sleep(1100);
        var cp = findIt(ocrAll(), function (it) { return it.t.indexOf('复') >= 0 && it.t.indexOf('制') >= 0 || sim(it.t, '复制') >= 0.5; });
        if (cp) {
            click(cp.cx, cp.cy); sleep(900);
            var c = getClip();
            if (c && c !== 'WXAUTO_SENTINEL_913') gotCopy = c;
        } else {
            console.log('TEST-A 弹框无"复制"项 att=' + att + ' (预期: 图片消息) → 提示跳过路径 OK');
            back(); sleep(700);
        }
    }
    if (gotCopy) console.log('TEST-A 复制成功: "' + gotCopy + '"');
    else console.log('TEST-A 结论: 非文本类型 → 走提示跳过');
} else console.log('TEST-A 无左侧气泡');

// TEST B: 输入框长按 → 工具栏"粘贴" (不点发送)
setClip('「13」消息已收到'); sleep(500);
var pasted = false;
for (var att = 0; att < 3 && !pasted; att++) {
    gesture(900, [0.468 * W(), 0.9205 * H()], [0.468 * W(), 0.9205 * H()]); sleep(1100);
    var pt = findIt(ocrAll(), function (it) {
        return it.cy > 0.6 * H() && it.t.length <= 4 && it.t.indexOf('点击') < 0 && sim(it.t, '粘贴') >= 0.5;
    });
    if (pt) {
        console.log('TEST-B 工具栏"粘贴"命中 att=' + att + ' @' + Math.round(pt.cx) + ',' + Math.round(pt.cy));
        click(pt.cx, pt.cy); sleep(1000);
        // 验证输入框区域出现文本
        var box = findIt(ocrAll(), function (it) { return it.cy > 0.85 * H() && it.cy < 0.98 * H() && sim(it.t, '消息已收到') >= 0.5; });
        if (box) { pasted = true; console.log('TEST-B 输入框验证: "' + box.t + '" ✓'); }
        else console.warn('TEST-B 粘贴后输入框未见目标文本 att=' + att);
    } else {
        console.warn('TEST-B 未找到"粘贴" att=' + att);
        back(); sleep(700);
    }
}
if (!pasted) console.error('TEST-B 粘贴链路失败');
console.log('__DONE__');
