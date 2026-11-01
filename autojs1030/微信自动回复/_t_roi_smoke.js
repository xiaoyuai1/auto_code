/**
 * _t_roi_smoke.js — P0 冒烟: 裁剪 ROI → OCR 可行性/计时/坐标回映验证 (不动业务脚本)
 * 验证点: ① paddle 接受小图/薄条带 ② 裁剪加速比 ③ 回映坐标与全帧一致 (±12px) ④ 带内漏检
 * 产出: 全帧基线 + 4 种条带 (topbar/bottom/lower/thin) 双跑计时; 结尾 __ROI_SMOKE_PASS__/FAIL
 */
var B = require('./lib/shizuku-lib.js');

var TAG = '[roi-smoke]';
function W() { return device.width; }
function H() { return device.height; }
function nowMs() { return Date.now(); }

device.wakeUpIfNeeded();
// 内容背景: 拉微信 (与真实判定场景一致; 零 toast, 落点不定也不影响计时结论)
B.sh('am start -n com.tencent.mm/.ui.LauncherUI');
sleep(2500);

// ---- 全帧基线 ----
var t0 = nowMs();
var img = B.bScreencap('/sdcard/_t_roi_full.png');
if (!img) { console.error(TAG + ' screencap 失败, 终止'); exit(); }
var capMs = nowMs() - t0;

var t1 = nowMs();
var full = null, fullErr = '';
try { ocr.mode = 'paddle'; full = ocr.paddle.detect(img); } catch (e) { fullErr = String(e.message || e); }
var fullMs = nowMs() - t1;
if (!full) { console.error(TAG + ' 全帧 paddle 失败: ' + fullErr + ' — P0 不通过'); img.recycle(); exit(); }
console.log(TAG + ' 全帧 ' + W() + 'x' + H() + ' cap=' + capMs + 'ms ocr=' + fullMs + 'ms ' + full.length + '项');

var fullItems = [];
for (var i = 0; i < full.length; i++) {
    var r0 = full[i];
    if (!r0.bounds) continue;
    var tx0 = String(r0.label || r0.text || '').trim();
    if (!tx0) continue;
    fullItems.push({ t: tx0, cy: (r0.bounds.top + r0.bounds.bottom) / 2 });
}

// ---- ROI 定义 [名称, t, b] (高度分数, 全宽) ----
var ROIS = [
    ['topbar', 0.02, 0.16],   // 搜索栏带
    ['bottom', 0.85, 1.00],   // tab 栏带
    ['lower', 0.55, 1.00],    // 键盘/弹框半屏
    ['thin', 0.86, 0.97],     // 输入框条 (最薄, 压力测试)
];
var EDGE = 15; // 带边缘公平容差 px
var allPass = true;

for (var k = 0; k < ROIS.length; k++) {
    var name = ROIS[k][0], fT = ROIS[k][1], fB = ROIS[k][2];
    var y0 = Math.round(fT * H()), h = Math.round((fB - fT) * H());
    if (h < 60) { console.warn(TAG + ' ' + name + ' 高度不足跳过'); continue; }

    var crop = null;
    try { crop = images.clip(img, 0, y0, W(), h); } catch (eC) {
        console.error(TAG + ' ' + name + ' images.clip 异常: ' + eC + ' — P0 不通过');
        allPass = false; continue;
    }
    if (!crop) { console.error(TAG + ' ' + name + ' crop 返回 null — P0 不通过'); allPass = false; continue; }

    // 双跑: 第1次=裁片首跑, 第2次=热态; paddle 异常则落 mlkit 并如实标注
    var times = [], items = null, engine = 'paddle';
    for (var run = 0; run < 2; run++) {
        var tr = nowMs();
        if (engine === 'paddle') {
            try {
                ocr.mode = 'paddle';
                var rs = ocr.paddle.detect(crop);
                times.push(nowMs() - tr);
                if (run === 0) items = rs;
                continue;
            } catch (eP) {
                console.warn(TAG + ' ' + name + ' paddle 裁片异常: ' + String(eP.message || eP).slice(0, 80));
                engine = 'mlkit';
                times.push(-1);
                allPass = false;
            }
        }
        if (engine === 'mlkit' && run === 0) {
            try { ocr.mode = 'mlkit'; items = ocr.detect(crop); times[times.length - 1] = nowMs() - tr; }
            catch (eM) { items = null; }
        }
    }

    // 回映 + 配对 (同文包含 + |Δcy|<=12)
    var mapped = [];
    if (items) {
        for (var m = 0; m < items.length; m++) {
            var rr = items[m];
            if (!rr.bounds) continue;
            var tt = String(rr.label || rr.text || '').trim();
            if (!tt) continue;
            mapped.push({ t: tt, cy: (rr.bounds.top + rr.bounds.bottom) / 2 + y0 });
        }
    }
    var hit = 0;
    for (var a = 0; a < mapped.length; a++) {
        for (var bi = 0; bi < fullItems.length; bi++) {
            var fi = fullItems[bi];
            if ((fi.t.indexOf(mapped[a].t) >= 0 || mapped[a].t.indexOf(fi.t) >= 0)
                && Math.abs(fi.cy - mapped[a].cy) <= 12) { hit++; break; }
        }
    }
    // 带内漏检: 全帧有而裁片无
    var bandFull = 0, missList = [];
    for (var c = 0; c < fullItems.length; c++) {
        var fc = fullItems[c];
        if (fc.cy < y0 + EDGE || fc.cy > y0 + h - EDGE) continue;
        bandFull++;
        var found = false;
        for (var d = 0; d < mapped.length; d++) {
            if ((fc.t.indexOf(mapped[d].t) >= 0 || mapped[d].t.indexOf(fc.t) >= 0)
                && Math.abs(fc.cy - mapped[d].cy) <= 12) { found = true; break; }
        }
        if (!found) missList.push(fc.t);
    }
    console.log(TAG + ' [' + name + '] ' + W() + 'x' + h + ' (' + Math.round(h / H() * 100) + '%高)'
        + ' 引擎=' + engine + ' ocr=' + times[0] + '/' + times[1] + 'ms'
        + ' 项=' + mapped.length + ' 回映对上=' + hit + '/' + mapped.length
        + ' 带内漏检=' + missList.length + '/' + bandFull
        + (missList.length ? ' [' + missList.slice(0, 5).join('|') + ']' : ''));
    // 两侧文本对照 (人工判读业务字符串质量)
    var bandTexts = [];
    for (var c2 = 0; c2 < fullItems.length; c2++) {
        if (fullItems[c2].cy >= y0 && fullItems[c2].cy <= y0 + h) bandTexts.push(fullItems[c2].t);
    }
    var mapTexts = [];
    for (var d2 = 0; d2 < mapped.length; d2++) mapTexts.push(mapped[d2].t);
    console.log(TAG + '   全帧带内(' + bandTexts.length + '): ' + bandTexts.slice(0, 12).join(' | '));
    console.log(TAG + '   裁片回映(' + mapTexts.length + '): ' + mapTexts.slice(0, 12).join(' | '));
    crop.recycle();
}

// 参考: mlkit 引擎级对比 (信息项)
try {
    var tm0 = nowMs(); ocr.mode = 'mlkit'; var mf = ocr.detect(img);
    console.log(TAG + ' [参考] mlkit 全帧=' + (nowMs() - tm0) + 'ms ' + (mf ? mf.length : 0) + '项');
} catch (e2) { console.warn(TAG + ' mlkit 全帧异常: ' + e2); }

img.recycle();
console.log(TAG + (allPass ? ' __ROI_SMOKE_PASS__' : ' __ROI_SMOKE_FAIL__'));
