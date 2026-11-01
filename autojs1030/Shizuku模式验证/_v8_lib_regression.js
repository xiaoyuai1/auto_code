// _v8_lib_regression.js — shizuku-lib.js 零件库回归 (经 debugp 执行)
// 回归项: 自检 / screencap / OCR(mlkit 主)定位+容错 / 两层调度 / 验证式点击(dumpsys前台) / 失败即停
console.log("__START__");

var B = require("./lib/shizuku-lib.js");
let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}

try {
    // ===== 1. 自检 =====
    report("1.bSelfCheck", B.bSelfCheck(), "uid=2000 + 无障碍现状警示");

    // ===== 2. 设置页: OCR定位「蓝牙」→ 验证式点击 (dumpsys 前台变化) =====
    B.sh("am force-stop com.android.settings");
    B.sh("am start -a android.settings.SETTINGS");
    sleep(2200);
    let fwBefore = B.bForeground();
    let hit = B.bLocate({ ocrText: "蓝牙", framePath: "/sdcard/_v8_f.png" });
    report("2.bLocate OCR[蓝牙]", !!hit, hit ? ("(" + hit.x + "," + hit.y + ") " + hit.text) : "2轮未命中");
    if (hit) {
        let ok = B.bTapVerify(hit, function () {
            let fw = B.bForeground();
            return !!fw && fw !== fwBefore;
        });
        report("2b.bTapVerify(前台变化)", ok, "前=[" + fwBefore.slice(0, 50) + "] 后=[" + B.bForeground().slice(0, 50) + "]");
    }

    // ===== 3. 失败即停: 定位不存在的文本 → 应 2 轮后返回 null =====
    let t0 = Date.now();
    let miss = B.bLocate({ ocrText: "绝不存在文本xyz_999", framePath: "/sdcard/_v8_f.png" });
    // mlkit 主后 2 轮 ≈ 2.3s 实测; 下界 1500ms 仅防"瞬时返回"假通过 (paddle 时代阈值 4000ms 已随通道改版下调)
    report("3.失败即停(2轮→null)", miss === null && (Date.now() - t0) > 1500, "耗时=" + (Date.now() - t0) + "ms (含2轮OCR)");

    // ===== 4. 微信页 OCR 只读 (质量抽查) =====
    B.sh("am start -n com.tencent.mm/.ui.LauncherUI");
    sleep(3000);
    let img = B.bScreencap("/sdcard/_v8_wx.png");
    if (img) {
        let list = B.bOcr(img);
        let found = null;
        for (let i = 0; i < (list || []).length; i++) {
            if (list[i].text.indexOf("微信") >= 0) { found = list[i]; break; }
        }
        img.recycle();
        report("4.微信OCR(只读)", !!list && list.length > 5, "条目=" + (list ? list.length : 0) + " 含「微信」=" + (found ? "是" : "否(以实际页面为准)"));
    } else {
        report("4.微信OCR(只读)", false, "截屏失败");
    }

    B.sh("input keyevent 3");
    B.sh("rm -f /sdcard/_v8_f.png /sdcard/_v8_wx.png");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { B.sh("rm -f /sdcard/_v8_f.png /sdcard/_v8_wx.png"); B.sh("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
