// 测试: 自动给"文件传输助手"发一条消息, 触发真实微信通知 (验证通知格式)
console.log("__START__");
var WX = 'com.tencent.mm';
try { auto(); } catch (e) { console.error('无障碍未开: ' + e); exit(); }
threads.start(function () {
    var names = ['立即开始', 'START NOW', '允许'];
    for (var r = 0; r < 2; r++) for (var i = 0; i < names.length; i++) {
        var b = text(names[i]).findOne(1500);
        if (b) { try { b.click(); } catch (e) {} }
    }
});
if (!images.requestScreenCapture()) { console.error('截屏授权失败'); console.log('__DONE__'); exit(); }

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
function ocrWait(fn, timeout) {
    var dead = Date.now() + (timeout || 9000);
    while (Date.now() < dead) {
        var hit = findIt(ocrGrab(), fn);
        if (hit) return hit;
        sleep(700);
    }
    return null;
}

// 1. 到微信主界面
app.launch(WX); sleep(2500);
var mainDead = Date.now() + 8000;
while (Date.now() < mainDead) {
    var tab = findIt(ocrGrab(), function (it) { return it.cy > 0.9 * H() && it.t.indexOf('通讯录') >= 0; });
    if (tab) { console.log('已在主界面'); break; }
    back(); sleep(1300);
}
// 2. 点搜索图标
click(0.8366 * W(), 0.0801 * H());
var hint = ocrWait(function (it) { return it.t.indexOf('搜索') >= 0 && it.cy < 0.12 * H(); }, 8000);
console.log('搜索页: ' + (hint ? 'OK' : 'FAIL'));
// 3. 粘贴搜索词
setClip('文件传输助手'); sleep(400);
gesture(700, [0.5324 * W(), 0.0811 * H()], [0.5324 * W(), 0.0811 * H()]); sleep(900);
var pb = findIt(ocrGrab(), function (it) { return it.t.indexOf('粘贴') >= 0 && it.cy > 0.14 * H(); });
if (pb) { click(pb.cx, pb.cy); sleep(800); console.log('已粘贴搜索词'); }
// 4. 等结果点首项
var item = ocrWait(function (it) { return it.t.indexOf('联系人') >= 0 && it.cy < 0.3 * H(); }, 9000);
if (!item) { console.error('无联系人分组'); console.log('__DONE__'); exit(); }
sleep(500);
var row = findIt(ocrGrab(), function (it) { return it.top > item.b && it.t.indexOf('包含') < 0 && it.t.indexOf('点击粘贴') < 0; });
if (!row) { console.error('无结果行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
console.log('已进入文件传输助手聊天页');
// 5. 点输入条
click(0.467 * W(), 0.9205 * H()); sleep(1200);
// 6. 粘贴消息
setClip('wxauto通知样本A1'); sleep(400);
gesture(700, [0.467 * W(), 0.9205 * H()], [0.467 * W(), 0.9205 * H()]); sleep(900);
var pb2 = findIt(ocrGrab(), function (it) { return it.t.indexOf('粘贴') >= 0 && it.cy > 0.2 * H(); });
if (pb2) { click(pb2.cx, pb2.cy); sleep(900); console.log('已粘贴消息'); }
else console.warn('未找到粘贴按钮, 尝试讯飞条');
// 7. 找"发送"并发送
var send = ocrWait(function (it) { return it.t.indexOf('发送') >= 0 && it.cy > 0.8 * H(); }, 6000);
if (send) { click(send.cx, send.cy); console.log('已点发送'); }
else { console.error('未找到发送按钮'); console.log('__DONE__'); exit(); }
sleep(1500);
// 8. 退出到桌面, 等通知
back(); sleep(900); back(); sleep(900); home(); sleep(2000);
console.log('已回桌面, 等待微信通知...');
sleep(6000);
console.log('__DONE__');
