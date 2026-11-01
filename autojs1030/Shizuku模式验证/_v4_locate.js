// _v4_locate.js — Shizuku 识别族验证 (v4) — 经 debugp 推送 (模板在 resources/)
// 验证项: OCR(mlkit)找文字 / findImage找图标 / findMultiColors API链 / 全链路闭环(截屏→找图→点击→验证)
console.log("__START__");

let pass = 0, fail = 0;
function report(name, ok, detail) {
    if (ok) pass++; else fail++;
    console.log((ok ? "[PASS] " : "[FAIL] ") + name + " → " + detail);
}
function sh(cmd) {
    let r = shizuku(cmd);
    if (!r || r.code !== 0) console.log("  [sh] '" + cmd.slice(0, 70) + "' code=" + (r && r.code) + " err=" + String(r && r.error).trim().slice(0, 70));
    return r;
}

try {
    // ===== 前置: 回桌面, 截屏 =====
    sh("input keyevent 3"); sleep(1500);
    let t0 = Date.now();
    sh("screencap -p /sdcard/_v4_home.png");
    let shotMs = Date.now() - t0;
    let home = images.read("/sdcard/_v4_home.png");
    if (!home) { report("前置截屏", false, "images.read 失败"); console.log("__DONE__"); }
    else {
        console.log("  桌面截屏 " + home.getWidth() + "x" + home.getHeight() + " " + shotMs + "ms");

        // ===== 1. OCR(mlkit) 找文字 =====
        try {
            ocr.mode = "mlkit";
            let t1 = Date.now();
            let rs = ocr.detect(home);
            let ocrMs = Date.now() - t1;
            let labels = [];
            let setHit = null;
            for (let i = 0; i < rs.length; i++) {
                let lb = rs[i].label || rs[i].text;
                if (lb && lb.trim()) labels.push(String(lb).trim());
                if (lb && lb.indexOf("设置") >= 0 && !setHit) {
                    let b = rs[i].bounds;
                    setHit = { x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2) };
                }
            }
            report("1.OCR(mlkit)识别+找「设置」", !!setHit,
                "条目=" + labels.length + " 耗时=" + ocrMs + "ms 命中@(" + (setHit && setHit.x) + "," + (setHit && setHit.y) + ") 样本=[" + labels.slice(0, 8).join("|") + "]");
        } catch (eOcr) {
            report("1.OCR(mlkit)", false, "异常: " + String(eOcr.message || eOcr).slice(0, 90));
        }

        // ===== 2. findImage 找 YouTube 图标 =====
        let tpl = images.read("resources/youtube_icon.png");
        if (!tpl) {
            report("2.findImage", false, "模板读取失败 resources/youtube_icon.png");
        } else {
            let t2 = Date.now();
            let hit = images.findImage(home, tpl, { threshold: 0.85 });
            let fMs = Date.now() - t2;
            if (hit) {
                let cx = hit.x + Math.round(tpl.getWidth() / 2), cy = hit.y + Math.round(tpl.getHeight() / 2);
                report("2.findImage(YouTube图标)", true, "左上(" + hit.x + "," + hit.y + ") 中心(" + cx + "," + cy + ") 耗时=" + fMs + "ms");
                console.log("  TAP:" + cx + "," + cy); // 供闭环使用

                // ===== 4. 全链路闭环: 截屏→找图→点击→前台验证 =====
                sh("input tap " + cx + " " + cy);
                sleep(3500);
                let fw = sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'");
                let fwS = String(fw && fw.result || "").trim().split("\n").pop();
                report("4.全链路闭环(截屏→找图→tap→前台)", /youtube/i.test(fwS), "前台=" + fwS.slice(0, 90));
            } else {
                report("2.findImage(YouTube图标)", false, "全屏未命中 threshold=0.85 耗时=" + fMs + "ms");
                report("4.全链路闭环", false, "跳过 (未命中)");
            }
            tpl.recycle();
        }

        // ===== 3. findMultiColors API 链 (取色→多点比色) =====
        try {
            let bx = Math.round(home.getWidth() / 2), by = Math.round(home.getHeight() / 2);
            let c1 = images.pixel(home, bx, by);
            let c2 = images.pixel(home, bx + 12, by + 12);
            let t3 = Date.now();
            let pt = images.findMultiColors(home, c1, [[bx + 12, by + 12, c2]], { region: [bx - 60, by - 60, 120, 120] });
            let mMs = Date.now() - t3;
            report("3.findMultiColors(二维数组点)", !!pt, "基准(" + bx + "," + by + ") 命中=" + (pt ? "(" + pt.x + "," + pt.y + ")" : "null") + " 耗时=" + mMs + "ms");
        } catch (eM) {
            report("3.findMultiColors", false, "异常: " + String(eM.message || eM).slice(0, 90));
        }

        home.recycle();
        sh("rm -f /sdcard/_v4_home.png");
        sh("input keyevent 3");
    }
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f /sdcard/_v4_home.png"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
