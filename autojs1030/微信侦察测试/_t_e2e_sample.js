// E2E 样本测试: 同一引擎内 [注册通知监听 + 驱动微信发消息到文件传输助手]
// 目的: 抓取真实微信通知 title/text 格式; 同步验证生产操作链
console.log("__START__");
var WX = 'com.tencent.mm';
var MSG = 'wxauto通知样本A1';
var gotNotification = null;

try { auto(); } catch (e) { console.error('无障碍未开: ' + e); exit(); }
threads.start(function () {
    var names = ['立即开始', 'START NOW', '允许'];
    for (var r = 0; r < 2; r++) for (var i = 0; i < names.length; i++) {
        var b = text(names[i]).findOne(1200);
        if (b) { try { b.click(); } catch (e) {} }
    }
});
if (!images.requestScreenCapture()) { console.error('截屏授权失败'); console.log('__DONE__'); exit(); }
sleep(500);

// 注册监听 (只关心 com.tencent.mm)
events.observeNotification();
events.onNotification(function (n) {
    var pkg = String(n.getPackageName() || '');
    if (pkg !== WX) return;
    var rec = { title: String(n.getTitle() || ''), text: String(n.getText() || ''), number: n.number };
    gotNotification = rec;
    console.log('[微信通知] title="' + rec.title + '" text="' + rec.text + '" number=' + rec.number);
});

function W() { return device.width; } function H() { return device.height; }
function ocrGrab() {
    var img = images.captureScreen();
    if (!img) { console.warn('captureScreen=null'); return []; }
    var rs; try { rs = ocr.detect(img); } catch (e) { console.error('ocr异常:' + e); rs = []; }
    var out = [];
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i], t = String(r.label || r.text || '').trim(), b = r.bounds;
        if (!t || !b) continue;
        out.push({ t: t, top: b.top, b: b.bottom, cx: (b.left + b.right) / 2, cy: (b.top + b.bottom) / 2 });
    }
    console.log('ocr items=' + out.length);
    return out;
}
function findIt(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }
function ocrWait(fn, timeout) {
    var dead = Date.now() + (timeout || 9000);
    while (Date.now() < dead) {
        var hit = findIt(ocrGrab(), fn);
        if (hit) return hit;
        sleep(700);
    }
    return null;
}
function fail(msg) { console.error('FAIL: ' + msg); console.log('__DONE__'); exit(); }

// 1. 到主界面 (快速失败) — 底部tab特征(发现/我/微信/通[訊讯]录)≥2 或 顶部标题"微信"
function isMainNow() {
    var items = ocrGrab();
    var low = 0.9 * H();
    var hits = 0;
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.cy >= low && (it.t.indexOf('发现') >= 0 || it.t === '我' || it.t.indexOf('微信') >= 0
            || (it.t.indexOf('通') >= 0 && it.t.indexOf('录') >= 0))) hits++;
        if (it.cy < 0.09 * H() && it.cy > 0.03 * H() && it.t.indexOf('微信') >= 0) hits++;
    }
    return hits >= 2;
}
app.launch(WX); sleep(2500);
var okMain = isMainNow();
if (!okMain) { back(); sleep(1300); okMain = isMainNow(); }
if (!okMain) fail('不在微信主界面');
console.log('STEP1 主界面 OK');
// 2. 搜索
click(0.8366 * W(), 0.0801 * H());
var hint = ocrWait(function (it) { return it.t.indexOf('搜索') >= 0 && it.cy < 0.12 * H(); }, 8000);
if (!hint) fail('搜索页未打开');
console.log('STEP2 搜索页 OK');
// 3. 粘贴搜索词
setClip('文件传输助手'); sleep(400);
gesture(700, [0.5324 * W(), 0.0811 * H()], [0.5324 * W(), 0.0811 * H()]); sleep(900);
var pb = findIt(ocrGrab(), function (it) { return it.t.indexOf('粘贴') >= 0 && it.cy > 0.14 * H(); });
if (!pb) fail('未找到粘贴按钮');
click(pb.cx, pb.cy); sleep(900);
console.log('STEP3 粘贴 OK');
// 4. 联系人首项
var header = ocrWait(function (it) { return it.t.indexOf('联系人') >= 0 && it.cy < 0.3 * H(); }, 9000);
if (!header) fail('无联系人分组 (粘贴可能失败)');
sleep(400);
var items = ocrGrab();
var bar = findIt(items, function (it) { return it.t.indexOf('点击粘贴') >= 0; });
var row = findIt(items, function (it) { return it.top > header.b && (!bar || it.top < bar.top) && it.t.indexOf('包含') < 0; });
if (!row) fail('无联系人结果行');
click(row.cx, row.cy); sleep(2200);
console.log('STEP4 进入聊天页: "' + row.t + '"');
// 5. 点输入条 (键盘弹出)
click(0.467 * W(), 0.9205 * H()); sleep(1300);
// 6. 用讯飞"点击粘贴"条输入消息 (setClip 在 IME 活跃时自动出条)
setClip(MSG); sleep(1200);
var bar2 = findIt(ocrGrab(), function (it) { return it.t.indexOf('点击粘贴') >= 0; });
var pasted = false;
if (bar2) {
    // 点击"点击粘贴"标题行本身 (讯飞: 点条即粘贴)
    click(bar2.cx, bar2.cy); sleep(900);
    pasted = true; console.log('STEP6 讯飞条粘贴');
} else {
    // 兜底: 在输入条位置长按找"粘贴" (键盘弹出后输入条上移, 全屏找)
    gesture(700, [0.467 * W(), 0.75 * H()], [0.467 * W(), 0.75 * H()]); sleep(900);
    var pb2 = findIt(ocrGrab(), function (it) { return it.t.indexOf('粘贴') >= 0; });
    if (pb2) { click(pb2.cx, pb2.cy); sleep(900); pasted = true; console.log('STEP6 长按粘贴'); }
}
if (!pasted) fail('消息粘贴失败');
// 7. 发送 (右侧绿色"发送"按钮)
var send = ocrWait(function (it) { return it.t.indexOf('发送') >= 0 && it.cx > 0.7 * W() && it.cy > 0.55 * H(); }, 6000);
if (!send) fail('未找到发送按钮');
click(send.cx, send.cy); sleep(1500);
console.log('STEP7 已发送');
// 8. 回桌面等通知
back(); sleep(900); back(); sleep(900); home();
var dead = Date.now() + 15000;
while (Date.now() < dead && !gotNotification) sleep(600);
if (gotNotification) {
    console.log('=== 通知格式样本 ===');
    console.log('title="' + gotNotification.title + '"');
    console.log('text="' + gotNotification.text + '"');
    console.log('number=' + gotNotification.number);
    console.log('E2E OK');
} else {
    console.warn('15s 内未收到微信通知 (检查微信通知设置)');
}
console.log('__DONE__');
