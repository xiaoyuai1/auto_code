// 收尾: 在文件传输助手聊天页发消息并等待微信通知 (从当前聊天页状态继续)
console.log("__START__");
var WX = 'com.tencent.mm';
var MSG = 'wxauto通知样本A1';
var got = null;
auto();
if (!images.requestScreenCapture()) { console.error('截屏失败'); exit(); }
events.observeNotification();
events.onNotification(function (n) {
    if (String(n.getPackageName()) !== WX) return;
    got = { title: String(n.getTitle() || ''), text: String(n.getText() || ''), number: n.number };
    console.log('[微信通知到达] title="' + got.title + '" text="' + got.text + '" number=' + got.number);
});
function W() { return device.width; } function H() { return device.height; }
function ocrGrab() {
    var img = images.captureScreen();
    if (!img) return [];
    var rs; try { rs = ocr.detect(img); } catch (e) { rs = []; }
    var out = [];
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i], t = String(r.label || r.text || '').trim(), b = r.bounds;
        if (!t || !b) continue;
        out.push({ t: t, top: b.top, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
    }
    return out;
}
function findIt(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }
function sim(a, b) {
    if (!a || !b) return 0;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 1;
    var inter = 0, union = 0, k, seenC = {};
    for (k = 0; k < a.length; k++) if (!seenC[a[k]]) { seenC[a[k]] = 1; union++; if (b.indexOf(a[k]) >= 0) inter++; }
    for (k = 0; k < b.length; k++) if (!seenC[b[k]]) { seenC[b[k]] = 1; union++; }
    return union ? inter / union : 0;
}

// 1. 设剪贴板 → 点输入条 (键盘弹出, 讯飞条出现)
setClip(MSG); sleep(400);
click(0.468 * W(), 0.9205 * H()); sleep(1600);
// 2. 讯飞条内容行粘贴 (多轮重试)
var pasted = false;
for (var att = 0; att < 3 && !pasted; att++) {
    var items = ocrGrab();
    var bar = findIt(items, function (it) { return it.t.indexOf('点击粘贴') >= 0; });
    if (bar) {
        var content = findIt(items, function (it) { return it.cy > bar.b && it.cy < bar.b + 0.09 * H() && sim(it.t, MSG) >= 0.5; });
        var tgt = content || null;
        if (tgt) { click(tgt.cx, tgt.cy); sleep(900); pasted = true; console.log('讯飞条内容行粘贴 att=' + att); break; }
    }
    sleep(900);
}
if (!pasted) { console.error('粘贴失败'); console.log('__DONE__'); exit(); }
// 3. 找"发送"
var send = null, dead = Date.now() + 6000;
while (Date.now() < dead && !send) {
    send = findIt(ocrGrab(), function (it) { return it.t.indexOf('发送') >= 0 && it.cx > 0.7 * W() && it.cy > 0.5 * H(); });
    if (!send) sleep(700);
}
if (!send) { console.error('未找到发送'); console.log('__DONE__'); exit(); }
click(send.cx, send.cy); sleep(1600);
console.log('已点发送 @' + Math.round(send.cx) + ',' + Math.round(send.cy));
// 4. 回桌面
back(); sleep(900); back(); sleep(900); home(); sleep(1500);
// 5. 等微信通知
dead = Date.now() + 18000;
while (Date.now() < dead && !got) sleep(700);
if (got) {
    console.log('=== 通知格式样本 ===');
    console.log('title="' + got.title + '"');
    console.log('text="' + got.text + '"');
    console.log('number=' + got.number);
} else console.warn('18s 内未收到通知');
console.log("__DONE__");
