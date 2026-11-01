/**
 * Paddle OCR (PP-OCRv6 medium) 截图+识别 平均耗时基准
 * 预热 1 次不计入统计; 连续 N=5 轮 截屏→detect 全流程计时
 * 输出: 每轮明细 + 平均/最快/最慢 + 平均每项文字耗时
 */

var N = 5;

function main() {
    console.show();
    ocr.mode = "paddle";
    if (!requestScreenCapture()) {
        console.error("请求截图权限失败");
        console.log("__DONE__");
        return;
    }
    sleep(600);

    // 预热 (首次 bind + 模型加载, 不计入统计)
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

    console.log("──── 统计 (N=" + N + ") ────");
    console.log("平均总耗时(截图+识别): " + avgTotal.toFixed(0) + "ms");
    console.log("  其中 截图平均 " + avgCap.toFixed(0) + "ms / 识别平均 " + avgOcr.toFixed(0) + "ms");
    console.log("最快 " + minT + "ms / 最慢 " + maxT + "ms");
    console.log("平均识别文字项数: " + avgN.toFixed(1));
    console.log("平均每项文字耗时(识别累计/项累计): " + (ocrSum / itemSum).toFixed(1) + "ms/项");
    ocr.mode = "mlkit";
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("基准失败: " + e + "\n" + (e && e.stack || ""));
    console.log("__DONE__");
}
