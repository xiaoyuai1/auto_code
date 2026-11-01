/**
 * 找图模式全面验证 v3 (真机 HONOR DNP-AN00 · AutoJs6 6.7.0)
 * 模板改为"全屏方差最大"的 64x64 区域(特征丰富), 其余同 v2
 * A~E: 高层 API 参数矩阵 | F: OpenCV 原生 6 方法 | G: ORB 特征匹配 | H: 缩放鲁棒性定量
 */
"use strict";
var __buf = [];
function log(s) { __buf.push(String(s)); console.log(String(s)); }
function logE(s) { __buf.push("[error] " + s); console.error(String(s)); }
function __flush() {
    try { files.write("/storage/emulated/0/脚本/_findimg_result.txt", __buf.join("\n")); } catch (e) {}
    try { files.write("/storage/emulated/0/脚本/_findimg_result.js", __buf.join("\n")); } catch (e) {}
}
function t0() { return Date.now(); }
function bench(fn, n) {
    var ts = [], out = null;
    for (var i = 0; i < n; i++) { var s = t0(); out = fn(); ts.push(t0() - s); }
    return { ms: ts.join("/"), out: out };
}
function jkind(path) {
    var s;
    try { s = String(eval("org.opencv." + path)); } catch (e) { return "err"; }
    if (s.indexOf("[JavaClass") === 0) return "class";
    if (s.indexOf("[JavaPackage") === 0) return "MISSING";
    return s.slice(0, 40);
}
function safeClick(w, label) {
    if (!w) return false;
    try { if (w.click()) return true; } catch (e) {}
    try { var p = w.parent(); if (p && p.click()) return true; } catch (e) {}
    var b = w.bounds();
    if (b && b.centerX() > 0 && b.centerY() > 0) return click(b.centerX(), b.centerY());
    return false;
}
function ensureCapture() {
    threads.start(function () {
        var dl = Date.now() + 10000;
        while (Date.now() < dl) {
            var btn = text("立即开始").findOnce() || desc("立即开始").findOnce();
            if (btn) { safeClick(btn, "立即开始"); break; }
            sleep(300);
        }
    });
    if (!requestScreenCapture()) throw new Error("截图权限未授予");
    sleep(300);
    var img = images.captureScreen();
    if (!img) throw new Error("captureScreen 返回空");
    return img;
}

var shot = null, tpl = null;
try {
    log("== 环境基线 ==");
    log("device: " + device.width + "x" + device.height);
    shot = ensureCapture();
    log("shot: " + shot.width + "x" + shot.height);

    importClass(org.opencv.core.Mat);
    importClass(org.opencv.core.MatOfDouble);
    importClass(org.opencv.core.Core);
    importClass(org.opencv.imgproc.Imgproc);

    // 自动选模板: 全屏 64x64 网格扫描, 取通道方差和最大(特征最丰富)的区域
    var TW = 64;
    var mSrc = shot.getMat();
    var best = null, step = 160;
    for (var yy = 400; yy + TW < mSrc.rows() - 200; yy += step) {
        for (var xx = 60; xx + TW < mSrc.cols() - 60; xx += step) {
            var sub = mSrc.submat(yy, yy + TW, xx, xx + TW);
            var mean = new MatOfDouble(), std = new MatOfDouble();
            Core.meanStdDev(sub, mean, std);
            var ch = std.get(0, 0); // CV_64FC4: 4 通道值在 (0,0) 的数组里
            var ssum = 0;
            for (var c = 0; c < (ch ? ch.length : 0); c++) ssum += ch[c];
            sub.release(); mean.release(); std.release();
            if (!best || ssum > best.s) best = { x: xx, y: yy, s: ssum };
        }
    }
    var tx = best.x, ty = best.y;
    tpl = images.clip(shot, tx, ty, TW, TW);
    log("tpl: " + TW + "x" + TW + " 自动选位 @(" + tx + "," + ty + ") 方差和=" + best.s.toFixed(1));
    var mTpl = tpl.getMat();

    log("== A~E 高层 API 参数矩阵 ==");
    var a = bench(function () { return images.findImage(shot, tpl, { threshold: 0.85 }); }, 3);
    log("[A] findImage 全屏 x3: " + a.ms + "ms -> " + a.out);

    var b = bench(function () {
        return images.findImage(shot, tpl, {
            threshold: 0.85,
            region: [Math.max(0, tx - 60), Math.max(0, ty - 60), TW + 120, TW + 120]
        });
    }, 3);
    log("[B] findImage 区域 x3: " + b.ms + "ms -> " + b.out);

    var c = bench(function () { return images.matchTemplate(shot, tpl, { threshold: 0.5, max: 50 }); }, 1);
    var r = c.out;
    if (r && r.best()) {
        log("[C] matchTemplate: " + c.ms + "ms, matches=" + r.matches.length +
            ", best=" + Number(r.best().similarity).toFixed(4) +
            "@(" + Number(r.best().point.x) + "," + Number(r.best().point.y) + ")");
        r.matches.slice(0, 3).forEach(function (m, i) {
            log("    #" + i + " sim=" + Number(m.similarity).toFixed(4) +
                " @(" + Number(m.point.x) + "," + Number(m.point.y) + ")");
        });
    } else {
        log("[C] matchTemplate 无结果: " + c.ms + "ms");
    }

    [0, 1, 2, 3, 4].forEach(function (lv) {
        try {
            var d = bench(function () { return images.findImage(shot, tpl, { threshold: 0.85, level: lv }); }, 2);
            log("[D] level=" + lv + ": " + d.ms + "ms -> " + d.out);
        } catch (eD) { log("[D] level=" + lv + " 异常: " + eD.message); }
    });

    try {
        var gShot = images.grayscale(shot), gTpl = images.grayscale(tpl);
        var e = bench(function () { return images.findImage(gShot, gTpl, { threshold: 0.85 }); }, 3);
        log("[E] 灰度预处理全屏 x3: " + e.ms + "ms -> " + e.out);
        gShot.recycle(); gTpl.recycle();
    } catch (eE) { log("[E] 灰度异常: " + eE.message); }

    log("== F. OpenCV 原生 Imgproc.matchTemplate 6 方法 ==");
    var METHODS = [
        ["TM_SQDIFF", 0, true], ["TM_SQDIFF_NORMED", 1, true],
        ["TM_CCORR", 2, false], ["TM_CCORR_NORMED", 3, false],
        ["TM_CCOEFF", 4, false], ["TM_CCOEFF_NORMED", 5, false]
    ];
    METHODS.forEach(function (m) {
        try {
            var out = new Mat();
            var s = t0();
            Imgproc.matchTemplate(mSrc, mTpl, out, m[1]);
            var mm = Core.minMaxLoc(out);
            var el = t0() - s;
            var loc = m[2] ? mm.minLoc : mm.maxLoc;
            var val = m[2] ? mm.minVal : mm.maxVal;
            log("[F] " + m[0] + ": " + el + "ms, best@(" + Number(loc.x) + "," + Number(loc.y) +
                ") val=" + Number(val).toFixed(4));
            out.release();
        } catch (eF) { log("[F] " + m[0] + " 异常: " + eF.message); }
    });
    try {
        var out2 = new Mat();
        var f2 = bench(function () {
            Imgproc.matchTemplate(mSrc, mTpl, out2, 5);
            return Core.minMaxLoc(out2).maxVal;
        }, 3);
        log("[F] 原生 TM_CCOEFF_NORMED x3: " + f2.ms + "ms, val=" + Number(f2.out).toFixed(4));
        out2.release();
    } catch (eF2) { log("[F] 原生基准异常: " + eF2.message); }

    var ORB_READY = false;
    log("== G. features2d 特征匹配 (ORB) ==");
    if (jkind("features2d.ORB") === "class" && jkind("features2d.DescriptorMatcher") === "class") {
        try {
            importClass(org.opencv.features2d.ORB);
            importClass(org.opencv.features2d.DescriptorMatcher);
            importClass(org.opencv.core.MatOfKeyPoint);
            importClass(org.opencv.core.MatOfDMatch);
            ORB_READY = true;
            var gray = new Mat(), grayT = new Mat();
            try { Imgproc.cvtColor(mSrc, gray, Imgproc.COLOR_RGBA2GRAY); }
            catch (eG1) { Imgproc.cvtColor(mSrc, gray, Imgproc.COLOR_BGR2GRAY); }
            try { Imgproc.cvtColor(mTpl, grayT, Imgproc.COLOR_RGBA2GRAY); }
            catch (eG2) { Imgproc.cvtColor(mTpl, grayT, Imgproc.COLOR_BGR2GRAY); }
            var orb = ORB.create(1000, 1.2, 8, 8, 0, 2, ORB.HARRIS_SCORE, 16, 20);
            var k1 = new MatOfKeyPoint(), d1 = new Mat();
            var k2 = new MatOfKeyPoint(), d2 = new Mat();
            var sG = t0();
            orb.detectAndCompute(gray, new Mat(), k1, d1);
            orb.detectAndCompute(grayT, new Mat(), k2, d2);
            var matcher = DescriptorMatcher.create(DescriptorMatcher.BRUTEFORCE_HAMMING);
            var matches = new MatOfDMatch();
            matcher.match(d2, d1, matches);
            var arr = matches.toArray();
            var good = 0, dsum = 0;
            for (var i2 = 0; i2 < arr.length; i2++) { dsum += arr[i2].distance; if (arr[i2].distance < 32) good++; }
            log("[G] ORB: srcKps=" + k1.rows() + " tplKps=" + k2.rows() + " matches=" + arr.length +
                " good(dist<32)=" + good + " 平均dist=" + (arr.length ? (dsum / arr.length).toFixed(1) : "-") +
                ", 耗时 " + (t0() - sG) + "ms");
            gray.release(); grayT.release();
        } catch (eG) { log("[G] ORB 异常: " + eG.message); }
    } else {
        log("[G] features2d 不可用, 跳过");
    }

    log("== H. 缩放鲁棒性定量 (模板放大1.25x) ==");
    try {
        var tplS = images.scale(tpl, 1.25, 1.25);
        var h1 = null;
        try { h1 = images.findImage(shot, tplS, { threshold: 0.8 }); } catch (eH1) { h1 = "异常:" + eH1.message; }
        log("[H1] findImage(1.25x, thr=0.8): " + h1 + "   [真实位置=(" + tx + "," + ty + ")]");
        var cS = images.matchTemplate(shot, tplS, { threshold: 0.3, max: 3 });
        log("[H2] matchTemplate(1.25x) best=" + (cS.best() ?
            Number(cS.best().similarity).toFixed(4) + "@(" + Number(cS.best().point.x) + "," + Number(cS.best().point.y) + ")" : "null"));
        // 原生: 真实位置处的相似度值 (out 坐标 = 大图左上角, out.get(y, x))
        var outS = new Mat();
        Imgproc.matchTemplate(mSrc, tplS.getMat(), outS, 5);
        var valTrue = outS.get(ty, tx)[0];
        var mmS = Core.minMaxLoc(outS);
        log("[H3] 原生TM_CCOEFF_NORMED(1.25x): 真实位置val=" + Number(valTrue).toFixed(4) +
            " vs 全图best=" + Number(mmS.maxVal).toFixed(4) + "@(" + Number(mmS.maxLoc.x) + "," + Number(mmS.maxLoc.y) + ")");
        outS.release();
        if (ORB_READY) {
            try {
                var grayS = new Mat();
                try { Imgproc.cvtColor(tplS.getMat(), grayS, Imgproc.COLOR_RGBA2GRAY); }
                catch (eH3) { Imgproc.cvtColor(tplS.getMat(), grayS, Imgproc.COLOR_BGR2GRAY); }
                var k3 = new MatOfKeyPoint(), d3 = new Mat();
                var orb2 = ORB.create(1000, 1.2, 8, 8, 0, 2, ORB.HARRIS_SCORE, 16, 20);
                orb2.detectAndCompute(grayS, new Mat(), k3, d3);
                var matcher2 = DescriptorMatcher.create(DescriptorMatcher.BRUTEFORCE_HAMMING);
                var matches2 = new MatOfDMatch();
                matcher2.match(d3, d1, matches2);
                var arr2 = matches2.toArray();
                var good2 = 0;
                for (var i3 = 0; i3 < arr2.length; i3++) if (arr2[i3].distance < 32) good2++;
                log("[H4] ORB(1.25x模板): tplKps=" + k3.rows() + " matches=" + arr2.length + " good=" + good2);
                grayS.release();
            } catch (eH2) { log("[H4] ORB 异常: " + eH2.message); }
        }
        tplS.recycle();
    } catch (eH) { log("[H] 异常: " + eH.message); }
} catch (e) {
    logE("主流程异常: " + e.message + "\n" + (e.stack || ""));
} finally {
    try { if (tpl) tpl.recycle(); } catch (eR) {}
    __flush();
    console.log("__DONE__");
}
