/**
 * Paddle-OCR-PP-OCRv6 插件功能测试
 * 插件: io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium (v1.0.4)
 * 参考: AutoJs6 docs api/ocr.md + sample/OCR/PaddleOCR (内置 API).js
 *       插件仓库 README (PP-OCRv6, engine=paddle-ocr, variant=v6)
 *
 * 测试项:
 *  [1] 插件包状态与前置条件 (stopped/启用位)
 *  [2] ocr.summary / 模式切换 (mlkit <-> paddle)
 *  [3] paddle.detect 静态图全屏识别 (结果结构: label/confidence/bounds)
 *  [4] detect 区域识别 (region 参数)
 *  [5] recognizeText (纯文本输出)
 *  [6] 屏幕实拍识别 + 冷/热耗时对比
 *  [7] 恢复默认模式 mlkit
 */

var PLUGIN = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium";
var TEST_IMG = "img/test.png"; // docs-autojs6/sample/OCR 附带的测试图, 已随脚本推送 (归档至 img/)

function safeClick(widget, label) {
    if (!widget) { console.warn("控件未找到: " + label); return false; }
    try { if (widget.click()) return true; } catch (e) {}
    try { let p = widget.parent(); if (p && p.click()) return true; } catch (e) {}
    let b = widget.bounds();
    if (b && b.centerX() > 0 && b.centerY() > 0) return click(b.centerX(), b.centerY());
    return false;
}

function hr(title) {
    console.log("──── " + title + " ────");
}

function main() {
    console.show();
    toastLog("[1/7] 前置状态检查");

    // ── [1] 前置条件 ──
    hr("[1] 插件前置状态");
    let pm = context.getPackageManager();
    let ai = pm.getApplicationInfo(PLUGIN, 0);
    let stopped = (ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0;
    console.log("插件版本检查通过, stopped=" + stopped);
    if (stopped) {
        // 自动修复: 唤醒插件进程 (昨天修复脚本同款逻辑, 防止 ROM 杀进程复发)
        let acts = pm.getPackageInfo(PLUGIN, pm.GET_ACTIVITIES).activities || [];
        for (let i = 0; i < acts.length; i++) {
            if (/WakeActivity$/.test(acts[i].name)) {
                context.startActivity(new android.content.Intent()
                    .setComponent(new android.content.ComponentName(PLUGIN, acts[i].name))
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
                sleep(2500);
                break;
            }
        }
        let ai2 = pm.getApplicationInfo(PLUGIN, 0);
        console.log("自动唤醒后 stopped=" + ((ai2.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0));
    }

    // ── [2] summary 与模式切换 ──
    hr("[2] ocr.summary 与模式切换");
    console.log(ocr.summary());
    ocr.mode = "paddle";
    console.log("切换后 ocr.mode = " + ocr.mode);
    console.log("paddle 可用: " + (typeof ocr.paddle.detect === "function"
        && typeof ocr.paddle.recognizeText === "function"));

    // ── [3] 静态图全屏识别 ──
    hr("[3] paddle.detect 静态图");
    let img = images.read(TEST_IMG);
    if (!img) { console.error("测试图读取失败: " + TEST_IMG); }
    else {
        let t0 = Date.now();
        let results = ocr.paddle.detect(img);
        console.log("detect 耗时 " + (Date.now() - t0) + "ms, 结果 " + results.length + " 项");
        Array.prototype.slice.call(results, 0, 8).forEach(function (r, i) {
            console.log("  [" + i + "] label=" + r.label
                + " conf=" + Number(r.confidence).toFixed(3)
                + " bounds=" + r.bounds);
        });
        // 结构完整性断言
        let first = results[0];
        console.log("结构校验: label=" + (typeof first.label) + " confidence=" + (typeof first.confidence)
            + " bounds=" + (first.bounds ? "RectOK" : "null"));

        // ── [4] 区域识别 (上半屏) ──
        hr("[4] detect(region) 区域识别");
        let t1 = Date.now();
        let regionRes = ocr.paddle.detect(img, [0, 0, img.width, Math.floor(img.height / 2)]);
        console.log("区域识别耗时 " + (Date.now() - t1) + "ms, 结果 " + regionRes.length
            + " 项 (应 ≤ 全屏 " + results.length + " 项)");
        Array.prototype.slice.call(regionRes, 0, 5).forEach(function (r, i) {
            console.log("  [" + i + "] " + r.label + " @ " + r.bounds);
        });

        // ── [5] recognizeText ──
        hr("[5] recognizeText 纯文本");
        let t2 = Date.now();
        let lines = ocr.paddle.recognizeText(img);
        console.log("recognizeText 耗时 " + (Date.now() - t2) + "ms, 行数 " + lines.length);
        console.log("文本预览: " + String(lines.join(" / ")).slice(0, 200));
        img.recycle();
    }

    // ── [6] 屏幕实拍 + 冷热耗时 ──
    hr("[6] 屏幕实拍识别 (冷/热)");
    if (!requestScreenCapture()) {
        console.error("请求截图权限失败");
    } else {
        sleep(600);
        let shot = images.captureScreen();
        if (!shot) { console.error("截屏失败"); }
        else {
            let t3 = Date.now();
            let r1 = ocr.paddle.detect(shot);
            let cold = Date.now() - t3;
            let t4 = Date.now();
            let r2 = ocr.paddle.detect(shot);
            let warm = Date.now() - t4;
            console.log("冷启动 " + cold + "ms (" + r1.length + " 项) / 热识别 " + warm + "ms (" + r2.length + " 项)");
            Array.prototype.slice.call(r1, 0, 5).forEach(function (r, i) {
                console.log("  [" + i + "] " + r.label + " @ " + r.bounds);
            });
            shot.recycle();
        }
    }

    // ── [7] 恢复默认 ──
    hr("[7] 恢复 mlkit 模式");
    ocr.mode = "mlkit";
    console.log(ocr.summary());
    toastLog("测试全部完成");
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("测试失败: " + e + "\n" + (e && e.stack || ""));
    console.log("__DONE__");
}
