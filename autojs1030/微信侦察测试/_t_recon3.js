// 侦察3: 验证需求2核心链路 — 定位最新好友气泡 → 长按 → 复制 → 剪贴板取精确原文 (只读不发消息)
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
// 进"静水流虚"聊天 (相似度匹配列表行, 防繁体误读)
var row = findIt(ocrAll(), function (it) { return sim(it.t, '静水流虚') >= 0.7 && it.cy > 0.15 * H() && it.cy < 0.7 * H() && it.l < 0.4 * W(); });
if (!row) { console.error('列表无静水流虚行'); console.log('__DONE__'); exit(); }
click(row.cx, row.cy); sleep(2200);
console.log('STEP1 已进聊天页');

// STEP2 保险滑动到底 (下→上 fling)
swipe(0.5 * W(), 0.82 * H(), 0.5 * W(), 0.32 * H(), 350);
sleep(1000);

// STEP3 定位最新好友气泡: 排除时间行/输入条/导航, 左侧, 取最下
var items = ocrAll();
var best = null;
for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.cy < 0.10 * H() || it.cy > 0.90 * H()) continue;              // 标题/输入条/导航
    var lp = it.l / W();
    if (lp >= 0.38) continue;                                            // 非左侧
    if (lp > 0.38 && lp < 0.62 && it.t.length <= 6) continue;            // 居中时间行
    if (/^\d{1,2}:\d{2}$/.test(it.t)) continue;                          // 时间格式
    if (!best || it.b > best.b) best = it;
}
if (!best) { console.error('未找到好友气泡'); console.log('__DONE__'); exit(); }
console.log('STEP3 最新好友气泡: "' + best.t + '" @' + Math.round(best.cx) + ',' + Math.round(best.cy) + ' bottom%=' + (best.b / H()).toFixed(3));

// STEP4 长按 → OCR找"复制" → 点击 → 剪贴板取原文
setClip('WXAUTO_SENTINEL_913'); sleep(400);
var copied = null;
for (var att = 0; att < 3 && !copied; att++) {
    gesture(900, [best.cx, best.cy], [best.cx, best.cy]); sleep(1100);
    var pop = findIt(ocrAll(), function (it) { return it.t.indexOf('复制') >= 0; });
    if (pop) {
        console.log('STEP4 弹框"复制"命中 att=' + att + ' @' + Math.round(pop.cx) + ',' + Math.round(pop.cy));
        click(pop.cx, pop.cy); sleep(900);
        var c = getClip();
        if (c && c !== 'WXAUTO_SENTINEL_913') copied = c;
        else console.warn('  剪贴板仍是哨兵, 重试');
    } else {
        console.warn('  弹框未出现或无"复制"项 att=' + att);
        back(); sleep(600); // 关闭可能残留的弹框
    }
}
if (copied) {
    console.log('=== 剪贴板精确原文 ===');
    console.log('"' + copied + '"');
    console.log('STEP5 对比: OCR串="' + best.t + '" | 通知文本应="13" | copy一致=' + (sim(copied, best.t) >= 0.5));
} else {
    console.error('复制链路失败');
}
console.log('__DONE__');
