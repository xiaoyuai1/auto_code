// 侦察: 标定聊天页气泡几何 (左=好友/右=自己) — 只读, 不发消息
console.log("__START__");
var WX = 'com.tencent.mm';
auto();
if (!images.requestScreenCapture()) { console.error('截屏失败'); exit(); }
sleep(400);
function W() { return device.width; } function H() { return device.height; }
function ocrDump(tag) {
    var img = images.captureScreen();
    if (!img) { console.error(tag + ' captureScreen=null'); return; }
    var rs; try { rs = ocr.detect(img); } catch (e) { rs = []; }
    console.log('===== ' + tag + ' 共' + rs.length + '项 =====');
    for (var i = 0; i < rs.length; i++) {
        var r = rs[i], t = String(r.label || r.text || '').trim(), b = r.bounds;
        if (!t || !b) continue;
        var side = b.left < 0.5 * W() ? 'L' : 'R';
        console.log('[' + side + '] "' + t + '" @' + b.left + ',' + b.top + '-' + b.right + ',' + b.bottom
            + ' (left%=' + (b.left / W()).toFixed(2) + ' right%=' + (b.right / W()).toFixed(2) + ' top%=' + (b.top / H()).toFixed(3) + ') conf=' + (r.confidence || 0).toFixed(2));
    }
}

// 页A: 静水流虚聊天页 (对方消息)
ocrDump('A-静水流虚聊天页');

// 导航到文件传输助手 (自己消息样本)
back(); sleep(1200);
// 主界面判定
function isMain() {
    var img = images.captureScreen();
    var rs; try { rs = ocr.detect(img); } catch (e) { rs = []; }
    var hits = 0;
    for (var i = 0; i < rs.length; i++) {
        var t = String(rs[i].label || rs[i].text || ''), b = rs[i].bounds;
        if (!b) continue;
        if (b.centerY() > 0.9 * H() && (t.indexOf('发现') >= 0 || t === '我' || t.indexOf('微信') >= 0
            || (t.indexOf('通') >= 0 && t.indexOf('录') >= 0))) hits++;
        if (b.centerY() < 0.09 * H() && b.centerY() > 0.03 * H() && t.indexOf('微信') >= 0) hits++;
    }
    return hits >= 2;
}
var tries = 0;
while (!isMain() && tries < 4) { back(); sleep(1300); tries++; }
if (!isMain()) { console.error('未到主界面, 终止'); console.log('__DONE__'); exit(); }
console.log('已到主界面');
// 搜索文件传输助手
click(0.8366 * W(), 0.0801 * H()); sleep(1800);
setClip('文件传输助手'); sleep(400);
gesture(700, [0.5324 * W(), 0.0811 * H()], [0.5324 * W(), 0.0811 * H()]); sleep(900);
var items; var img2 = images.captureScreen();
try { items = ocr.detect(img2); } catch (e) { items = []; }
var pb = null;
for (var k = 0; k < items.length; k++) {
    var t = String(items[k].label || items[k].text || ''), b = items[k].bounds;
    if (t.indexOf('粘贴') >= 0 && t.indexOf('点击') < 0 && b && b.centerY() > 0.12 * H() && b.centerY() < 0.3 * H()) { pb = items[k]; break; }
}
var bar = null;
for (var k = 0; k < items.length; k++) {
    var t = String(items[k].label || items[k].text || '');
    if (t.indexOf('点击粘贴') >= 0) { bar = items[k]; break; }
}
if (pb) { click(pb.bounds.centerX(), pb.bounds.centerY()); sleep(900); console.log('气泡粘贴'); }
else if (bar) {
    var img3 = images.captureScreen();
    var its3; try { its3 = ocr.detect(img3); } catch (e) { its3 = []; }
    for (var k = 0; k < its3.length; k++) {
        var b = its3[k].bounds, t = String(its3[k].label || its3[k].text || '');
        if (b && b.centerY() > bar.bounds.bottom && b.centerY() < bar.bounds.bottom + 0.09 * H() && t.indexOf('文件传输') >= 0) {
            click(b.centerX(), b.centerY()); sleep(900); console.log('讯飞条粘贴'); break;
        }
    }
}
sleep(1500);
// 点首项 (功能/联系人组下第一行)
var img4 = images.captureScreen();
var its4; try { its4 = ocr.detect(img4); } catch (e) { its4 = []; }
var row = null;
for (var k = 0; k < its4.length; k++) {
    var b = its4[k].bounds, t = String(its4[k].label || its4[k].text || '');
    if (!b) continue;
    if (t.indexOf('包含') >= 0 || t.indexOf('点击粘贴') >= 0 || t.indexOf('搜索网络') >= 0 || t.indexOf('功能') >= 0 || t.indexOf('联系人') >= 0 || t.indexOf('常用语') >= 0 || t.indexOf('拆词') >= 0) continue;
    if (b.top > 0.12 * H() && b.top < 0.5 * H() && t.indexOf('文件传输') >= 0) { row = its4[k]; break; }
}
if (!row) { console.error('未找到文件传输助手行'); console.log('__DONE__'); exit(); }
click(row.bounds.centerX(), row.bounds.centerY()); sleep(2200);
// 页B: 文件传输助手聊天页 (自己消息)
ocrDump('B-文件传输助手聊天页');
// 导航退出: 回到静水流虚原状态附近 (回主界面即可)
back(); sleep(900); back(); sleep(900);
console.log('__DONE__');
