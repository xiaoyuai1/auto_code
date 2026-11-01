// _t_b_smoke.js — wxauto-B 基座冒烟 (不涉及联系人/不回复)
console.log("__START__");
var B = require("./lib/shizuku-lib.js");
try {
    console.log("[1] 自检: " + (B.bSelfCheck() ? "PASS" : "FAIL"));

    console.log("[2] 启动微信→前台判定(dumpsys)");
    app.launch("com.tencent.mm"); sleep(3000);
    var fg = B.bForeground();
    console.log("  前台=" + fg.slice(0, 80));
    console.log("  微信前台=" + (/com\.tencent\.mm/.test(fg) ? "PASS" : "FAIL"));

    console.log("[3] ocrGrab 链路 (screencap+paddle)");
    var img = B.bScreencap("/sdcard/_smoke.png");
    if (!img) { console.log("  截屏 FAIL"); }
    else {
        var t0 = Date.now();
        var rs = B.bOcr(img);
        img.recycle();
        console.log("  bOcr 耗时=" + (Date.now() - t0) + "ms 条目=" + (rs ? rs.length : 0));
        var sample = [];
        for (var i = 0; i < (rs || []).length && sample.length < 8; i++) if (rs[i].text) sample.push(rs[i].text);
        console.log("  样本=[" + sample.join("|") + "]");
    }

    console.log("[4] 输入基元");
    console.log("  bKey(HOME)=" + B.bKey(3) + " (返回后桌面)");
    sleep(800);
    app.launch("com.tencent.mm"); sleep(1500);
} catch (e) {
    console.error("异常: " + e + " | " + e.stack);
}
console.log("__DONE__");
