// _v7_paddle.js — 阶段0: B 模式 paddle 主通道补测 (small 模型)
// 验证项: 插件现状 / paddle 冷热耗时 / mlkit 对照 / 微信页识别质量对比 / finally 恢复
console.log("__START__");

let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function sh(cmd) {
    let r = shizuku(cmd);
    if (!r || r.code !== 0) console.log("  [sh] '" + cmd.slice(0, 60) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 80));
    return r;
}

try {
    // ===== 1. 插件现状 =====
    let rp = sh("pm list packages | grep -i paddleocr");
    console.log("  paddle 插件包: " + String(rp && rp.result).trim().replace(/\n/g, " | "));

    // ===== 2. 设置页: paddle x3 (首跑含冷态) vs mlkit x2 =====
    sh("am force-stop com.android.settings");
    sh("am start -a android.settings.SETTINGS"); sleep(2200);
    sh("screencap -p /sdcard/_v7_s.png");
    let img = images.read("/sdcard/_v7_s.png");
    if (!img) { report("前置截屏", false, "read失败"); console.log("__DONE__"); }
    else {
        let pTimes = [], pErr = "", pSample = [], pCnt = 0;
        for (let i = 0; i < 3; i++) {
            try {
                ocr.mode = "paddle";
                let t0 = Date.now();
                let rs = ocr.paddle.detect(img);
                pTimes.push(Date.now() - t0);
                if (i === 2) {
                    pCnt = rs.length;
                    for (let k = 0; k < rs.length && pSample.length < 10; k++) {
                        let lb = String(rs[k].label || rs[k].text || "").trim();
                        if (lb) pSample.push(lb);
                    }
                }
            } catch (eP) { pErr = String(eP.message || eP).slice(0, 90); break; }
            finally { ocr.mode = "mlkit"; }
        }
        let mTimes = [], mCnt = 0, mSample = [];
        try {
            ocr.mode = "mlkit";
            let rs = ocr.detect(img);
            mTimes.push(Date.now());
            mCnt = rs.length;
            for (let k = 0; k < rs.length && mSample.length < 10; k++) {
                let lb = String(rs[k].label || rs[k].text || "").trim();
                if (lb) mSample.push(lb);
            }
        } catch (eM) { console.log("  mlkit异常: " + eM.message); }
        finally { ocr.mode = "mlkit"; }
        report("2.设置页 paddle x3", pTimes.length > 0 && !pErr,
            (pErr ? "异常=" + pErr : "耗时=" + pTimes.join(",") + "ms (首跑含冷态) 条目=" + pCnt + " 样本=[" + pSample.join("|").slice(0, 110) + "]"));
        report("2b.设置页 mlkit 对照", mCnt > 0,
            "条目=" + mCnt + " 样本=[" + mSample.join("|").slice(0, 110) + "]");
        img.recycle();
    }

    // ===== 3. 微信页: paddle vs mlkit 质量 (只读) =====
    sh("am start -n com.tencent.mm/.ui.LauncherUI"); sleep(3200);
    sh("screencap -p /sdcard/_v7_wx.png");
    let wx = images.read("/sdcard/_v7_wx.png");
    if (wx) {
        let wP = { n: -1, t: 0, s: [], hit: false }, wM = { n: -1, t: 0, s: [], hit: false };
        try {
            ocr.mode = "paddle";
            let t0 = Date.now();
            let rs = ocr.paddle.detect(wx);
            wP.t = Date.now() - t0; wP.n = rs.length;
            for (let k = 0; k < rs.length && wP.s.length < 12; k++) {
                let lb = String(rs[k].label || rs[k].text || "").trim();
                if (lb) { wP.s.push(lb); if (/微信|通讯录|发现|我/.test(lb)) wP.hit = true; }
            }
        } catch (eP2) { wP.s = ["异常:" + String(eP2.message || eP2).slice(0, 60)]; }
        finally { ocr.mode = "mlkit"; }
        try {
            ocr.mode = "mlkit";
            let t1 = Date.now();
            let rs2 = ocr.detect(wx);
            wM.t = Date.now() - t1; wM.n = rs2.length;
            for (let k = 0; k < rs2.length && wM.s.length < 12; k++) {
                let lb = String(rs2[k].label || rs2[k].text || "").trim();
                if (lb) { wM.s.push(lb); if (/微信|通讯录|发现|我/.test(lb)) wM.hit = true; }
            }
        } catch (eM2) { wM.s = ["异常:" + String(eM2.message || eM2).slice(0, 60)]; }
        finally { ocr.mode = "mlkit"; }
        report("3.微信页 paddle(只读)", wP.n >= 0,
            "耗时=" + wP.t + "ms 条目=" + wP.n + " 底Tab命中=" + wP.hit + " [" + wP.s.join("|").slice(0, 130) + "]");
        report("3b.微信页 mlkit(只读)", wM.n >= 0,
            "耗时=" + wM.t + "ms 条目=" + wM.n + " 底Tab命中=" + wM.hit + " [" + wM.s.join("|").slice(0, 130) + "]");
        wx.recycle();
    } else {
        report("3.微信页对比", false, "read失败");
    }

    sh("input keyevent 3");
    sh("rm -f /sdcard/_v7_s.png /sdcard/_v7_wx.png");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { ocr.mode = "mlkit"; shizuku("rm -f /sdcard/_v7_s.png /sdcard/_v7_wx.png"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
