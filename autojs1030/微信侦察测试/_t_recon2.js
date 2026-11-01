// 侦察2: 从主界面列表直接进入两个聊天页, 全量标定左右气泡几何 — 只读
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
function dumpPage(tag) {
    var items = ocrAll();
    console.log('===== ' + tag + ' 共' + items.length + '项 =====');
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        console.log('"' + it.t + '" @' + it.l + ',' + it.top + '-' + it.r + ',' + it.b
            + ' (L%=' + (it.l / W()).toFixed(2) + ' R%=' + (it.r / W()).toFixed(2) + ' top%=' + (it.top / H()).toFixed(3) + ') conf=' + it.conf.toFixed(2));
    }
}
function findIt(items, fn) { for (var i = 0; i < items.length; i++) if (fn(items[i])) return items[i]; return null; }
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
console.log('主界面 OK');

// 页B: 点列表行"文件传输助手"
var row = findIt(ocrAll(), function (it) { return it.t.replace(/\s/g, '') === '文件传输助手' && it.cy > 0.15 * H() && it.cy < 0.7 * H(); });
if (!row) { console.error('列表无文件传输助手行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
dumpPage('B-文件传输助手聊天页');
back(); sleep(1300);

// 页A: 点列表行"静水流虚"
var row2 = findIt(ocrAll(), function (it) { return it.t.replace(/\s/g, '') === '静水流虚' && it.cy > 0.15 * H() && it.cy < 0.7 * H(); });
if (!row2) { console.error('列表无静水流虚行'); console.log('__DONE__'); exit(); }
click(row2.cx, row2.cy); sleep(2200);
dumpPage('A-静水流虚聊天页');
back(); sleep(1000);
console.log('__DONE__');
