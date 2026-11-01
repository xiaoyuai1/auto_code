/**
 * 全链路验证 v3: AI 裁剪模板 → home → 逐页扫桌找图 → 点击 → 校验包名
 * 加固: ① 截屏双通道(文件回读优先/MediaProjection 兜底) ② 多页桌面逐页扫(前4页向后翻, 后4页向前翻)
 * 日志落盘 /storage/emulated/0/脚本/_find_yt_result.js 供 MCP read_script 回读
 */
"use strict";
var __buf = [];
function log(s) { __buf.push(String(s)); console.log(String(s)); }
function logE(s) { __buf.push("[error] " + s); console.error(String(s)); }
function __flush() {
    try { files.write("/storage/emulated/0/脚本/_find_yt_result.js", __buf.join("\n")); } catch (e) {}
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
    // 通道1(优先): PC 侧截好的桌面帧 (免 MediaProjection, 免授权弹窗)
    var FB = "/sdcard/脚本/找图模式验证/_pc_shot.png";
    if (files.exists(FB)) {
        var img2 = images.read(FB);
        if (img2) { log("[1] 截屏通道: 文件回读 _pc_shot.png"); return img2; }
    }
    // 通道2: MediaProjection 实时截屏 (会话可能损坏, 快速探测 2 次)
    try {
        threads.start(function () {
            var dl = Date.now() + 8000;
            while (Date.now() < dl) {
                var btn = text("立即开始").findOnce() || desc("立即开始").findOnce();
                if (btn) { safeClick(btn, "立即开始"); break; }
                sleep(300);
            }
        });
        if (requestScreenCapture()) {
            for (var k = 0; k < 2; k++) {
                try {
                    var img = images.captureScreen();
                    if (img) { log("[1] 截屏通道: MediaProjection"); return img; }
                } catch (eC) { sleep(800); }
            }
        }
    } catch (eR) { log("[1] MediaProjection 不可用: " + String(eR.message).slice(0, 60)); }
    throw new Error("无可用截屏通道 (无 _pc_shot.png 且 MediaProjection 损坏)");
}

var TPL_PATHS = [
    "resources/youtube_icon.png",
    "/storage/emulated/0/脚本/找图模式验证/resources/youtube_icon.png"
];
var tpl = null;
try {
    // 1. 模板读取 (双路径容错)
    var usedPath = null;
    for (var i = 0; i < TPL_PATHS.length; i++) {
        if (files.exists(TPL_PATHS[i])) { usedPath = TPL_PATHS[i]; break; }
    }
    if (!usedPath) throw new Error("模板不存在, 尝试过: " + TPL_PATHS.join(" | "));
    tpl = images.read(usedPath);
    if (!tpl) throw new Error("模板解码失败: " + usedPath);
    log("[0] 模板: " + usedPath + " (" + tpl.width + "x" + tpl.height + ")");

    // 2. 截屏通道就绪 → 回桌面 → 逐页扫桌
    ensureCapture();
    home();
    sleep(1500);

    var hit = null, hitHow = "", gBest = null;   // gBest: 全局最优候选 (跨页降级用)
    var MAXP = 8;
    for (var pg = 0; pg < MAXP && !hit; pg++) {
        var frame = images.captureScreen();
        var t0 = Date.now();
        var mt = images.matchTemplate(frame, tpl, { threshold: 0.5, max: 10 });
        var el = Date.now() - t0;
        var best = mt && mt.best() ? mt.best() : null;
        var bestStr = best ? Number(best.similarity).toFixed(4) + "@(" + Number(best.point.x) + "," + Number(best.point.y) + ")" : "null";
        log("[2." + pg + "] 桌面页" + pg + ": matchTemplate " + el + "ms best=" + bestStr);
        if (best && (!gBest || Number(best.similarity) > Number(gBest.sim))) {
            gBest = { sim: Number(best.similarity), point: best.point };
        }
        var p85 = images.findImage(frame, tpl, { threshold: 0.85 });
        if (p85) { hit = p85; hitHow = "findImage thr=0.85 页" + pg; break; }
        if (best && Number(best.similarity) >= 0.85) { hit = best.point; hitHow = "matchTemplate 页" + pg; break; }
        if (pg < MAXP - 1) {
            // 翻页: 前 4 次向左(下一页), 后 3 次向右(上一页) 回扫
            if (pg < 4) swipe(1000, 1400, 150, 1400, 350);
            else swipe(150, 1400, 1000, 1400, 350);
            sleep(900);
        }
    }
    if (!hit && gBest && gBest.sim >= 0.7) {
        hit = gBest.point;
        hitHow = "跨页降级 best sim=" + gBest.sim.toFixed(4);
        log("[2x] 严格阈值未中, 降级取跨页最优 (sim=" + gBest.sim.toFixed(4) + ")");
    }

    if (!hit) {
        log("[X] " + MAXP + " 页均未命中, 验证失败 (模板或页面问题, 回 PC 重裁)");
    } else {
        var cx = hit.x + tpl.width / 2, cy = hit.y + tpl.height / 2;
        log("[3] 命中 (" + hitHow + "): 左上(" + hit.x + "," + hit.y + ") → 中心(" + cx + "," + cy + ")");

        // 3. 点击中心 (纯手势, 不受保护模式影响)
        var okClick = click(cx, cy);
        log("[4] click(" + cx + "," + cy + ") → " + okClick);
        sleep(3500);
        var pkg = currentPackage();  // AutoJs6 中是函数, 不是属性
        if (pkg !== "com.google.android.youtube") { sleep(2500); pkg = currentPackage(); }
        log("[5] 点击后前台包名: " + pkg);
        log(pkg === "com.google.android.youtube"
            ? "[✓] 全链路验证成功: AI裁剪模板 → 逐页扫桌找图 → 点击 → YouTube 已启动"
            : "[△] 已点击但前台包名非 youtube (可能首启弹窗/跳转中), 实际=" + pkg);
    }
} catch (e) {
    logE("主流程异常: " + e.message + "\n" + (e.stack || ""));
} finally {
    try { if (tpl) tpl.recycle(); } catch (eR) {}
    __flush();
    console.log("__DONE__");
}
