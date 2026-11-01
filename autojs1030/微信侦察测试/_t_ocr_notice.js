// 自检: ① 截屏授权(守护线程自动点) ② mlkit 暗色主题 OCR 质量 ③ 通知监听可用性
console.log("__START__");
// 1. 守护线程: 自动点截屏授权对话框 (系统对话框, 无障碍可操作)
threads.start(function () {
    let names = ["立即开始", "START NOW", "允许"];
    for (let round = 0; round < 2; round++) {
        for (let i = 0; i < names.length; i++) {
            let b = text(names[i]).findOne(1500);
            if (b) { try { b.click(); console.log("已自动点击授权: " + names[i]); } catch (e) {} }
        }
    }
});
let ok = images.requestScreenCapture();
console.log("requestScreenCapture: " + ok);
if (!ok) { console.error("截屏授权失败"); console.log("__DONE__"); exit(); }
sleep(800);
let img = images.captureScreen();
let rs = ocr.detect(img);
console.log("OCR 结果数: " + rs.length);
rs.forEach(function (r) {
    let t = r.label || r.text;
    let b = r.bounds;
    let bs = b ? (b.left + "," + b.top + "," + b.right + "," + b.bottom) : "?";
    let cf = r.confidence ? r.confidence.toFixed(2) : "?";
    console.log("  '" + t + "' @[" + bs + "] conf=" + cf);
});
// 2. 通知监听自检
try {
    events.observeNotification();
    events.onNotification(function (n) {
        console.log("[通知] pkg=" + n.getPackageName() + " | title=" + n.getTitle() + " | text=" + n.getText());
    });
    console.log("通知监听注册成功, 挂 5 秒观察...");
    sleep(5000);
} catch (e) {
    console.error("通知监听失败: " + e);
}
console.log("__DONE__");
