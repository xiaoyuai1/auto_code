/**
 * Paddle OCR PP-OCRv6 Small 档 截图+识别 平均耗时基准
 * 脚本端 ocr.paddle 无 engineId 参数 (源码确认), 两插件共存时 select() 顺序不定
 * 策略: 临时禁用 medium 启用位 → select() 只命中 small → 测完恢复
 * 流程: 预热 1 次不计入 → N=5 轮 截屏→detect 全流程计时 → 统计
 */

var MEDIUM = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.medium";
var SMALL = "io.github.supermonster003.autojs6.plugin.paddleocr.v6.small";
var N = 5;

function isStopped(pkg) {
    try {
        let ai = context.getPackageManager().getApplicationInfo(pkg, 0);
        return (ai.flags & android.content.pm.ApplicationInfo.FLAG_STOPPED) !== 0;
    } catch (e) { return "ERR"; }
}

function setEnableBit(pkg, value) {
    let sp = context.getSharedPreferences("plugin_center_enable_state",
        android.content.Context.MODE_PRIVATE);
    sp.edit().putBoolean("key_$_enabled_plugin_$_" + pkg, value).commit();
    return sp.getBoolean("key_$_enabled_plugin_$_" + pkg, true);
}

function wakeIfNeeded(pkg) {
    if (isStopped(pkg) !== true) return;
    let acts = context.getPackageManager().getPackageInfo(pkg,
        context.getPackageManager().GET_ACTIVITIES).activities || [];
    for (let i = 0; i < acts.length; i++) {
        if (/WakeActivity$/.test(acts[i].name)) {
            context.startActivity(new android.content.Intent()
                .setComponent(new android.content.ComponentName(pkg, acts[i].name))
                .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
            sleep(2500);
            try {
                context.startActivity(context.getPackageManager()
                    .getLaunchIntentForPackage(context.getPackageName())
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (e2) {}
            return;
        }
    }
}

function main() {
    console.show();

    // 0. 强制只启用 small (临时禁用 medium)
    console.log("[0] 引擎选择: 禁用 medium, 启用 small (small stopped=" + isStopped(SMALL) + ")");
    wakeIfNeeded(SMALL);
    setEnableBit(SMALL, true);
    setEnableBit(MEDIUM, false);
    console.log("    medium 已临时禁用, 本轮 detect 必命中 small");

    ocr.mode = "paddle";
    if (!requestScreenCapture()) {
        console.error("请求截图权限失败");
        setEnableBit(MEDIUM, true);
        console.log("__DONE__");
        return;
    }
    sleep(600);

    // 预热 (不计入统计)
    let warmImg = images.captureScreen();
    let tw = Date.now();
    ocr.paddle.detect(warmImg);
    warmImg.recycle();
    console.log("预热完成: " + (Date.now() - tw) + "ms (不计入统计)");

    let rows = [];
    for (let i = 1; i <= N; i++) {
        let t0 = Date.now();
        let img = images.captureScreen();
        let t1 = Date.now();
        let res = ocr.paddle.detect(img);
        let t2 = Date.now();
        img.recycle();
        rows.push({ cap: t1 - t0, ocr: t2 - t1, total: t2 - t0, n: res.length });
        console.log("第" + i + "轮: 截图 " + (t1 - t0) + "ms + 识别 " + (t2 - t1)
            + "ms = " + (t2 - t0) + "ms, 识别文字 " + res.length + " 项");
        sleep(300);
    }

    let sum = function (f) { return rows.reduce(function (a, r) { return a + f(r); }, 0); };
    let avgTotal = sum(function (r) { return r.total; }) / N;
    let avgCap = sum(function (r) { return r.cap; }) / N;
    let avgOcr = sum(function (r) { return r.ocr; }) / N;
    let avgN = sum(function (r) { return r.n; }) / N;
    let minT = Math.min.apply(null, rows.map(function (r) { return r.total; }));
    let maxT = Math.max.apply(null, rows.map(function (r) { return r.total; }));
    let ocrSum = sum(function (r) { return r.ocr; });
    let itemSum = sum(function (r) { return r.n; });

    console.log("──── Small 档统计 (N=" + N + ") ────");
    console.log("平均总耗时(截图+识别): " + avgTotal.toFixed(0) + "ms");
    console.log("  其中 截图平均 " + avgCap.toFixed(0) + "ms / 识别平均 " + avgOcr.toFixed(0) + "ms");
    console.log("最快 " + minT + "ms / 最慢 " + maxT + "ms");
    console.log("平均识别文字项数: " + avgN.toFixed(1));
    console.log("平均每项文字耗时: " + (ocrSum / itemSum).toFixed(1) + "ms/项");

    // 恢复 medium
    setEnableBit(MEDIUM, true);
    console.log("已恢复 medium 启用位");
    ocr.mode = "mlkit";
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("基准失败: " + e + "\n" + (e && e.stack || ""));
    try { setEnableBit(MEDIUM, true); } catch (e2) {}
    console.log("__DONE__");
}
