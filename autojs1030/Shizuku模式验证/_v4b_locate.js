// _v4b_locate.js — Shizuku 识别族验证 v4b (机上自举模板 + 修正版)
// 验证项: OCR找标签 / 机上裁剪模板+findImage / findMultiColors(相对偏移) / 全链路闭环
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
    sh("input keyevent 3"); sleep(1500);
    sh("screencap -p /sdcard/_v4b_home.png");
    let home = images.read("/sdcard/_v4b_home.png");
    if (!home) { report("前置截屏", false, "read失败"); console.log("__DONE__"); }
    else {
        // ===== 1. OCR 找「文件管理」标签 =====
        let labelHit = null, allLabels = [];
        try {
            ocr.mode = "mlkit";
            let t1 = Date.now();
            let rs = ocr.detect(home);
            let ocrMs = Date.now() - t1;
            for (let i = 0; i < rs.length; i++) {
                let lb = String(rs[i].label || rs[i].text || "").trim();
                if (lb) allLabels.push(lb);
                if (lb.indexOf("文件管理") >= 0 && !labelHit) {
                    let b = rs[i].bounds;
                    labelHit = { x: Math.round((b.left + b.right) / 2), y: Math.round((b.top + b.bottom) / 2), top: b.top };
                }
            }
            report("1.OCR找「文件管理」标签", !!labelHit, "条目=" + allLabels.length + " 耗时=" + ocrMs + "ms 全部=[" + allLabels.join("|").slice(0, 180) + "]");
        } catch (eO) {
            report("1.OCR", false, "异常: " + String(eO.message || eO).slice(0, 90));
        }

        // ===== 2. 机上裁剪模板 → findImage =====
        if (labelHit) {
            // 图标在标签正上方: 中心 ≈ (labelX, labelTop-190), 边长156
            let icx = labelHit.x, icy = labelHit.top - 190;
            let tpl = images.clip(home, icx - 78, icy - 78, 156, 156);
            let saved = false;
            try {
                saved = images.save(tpl, "/sdcard/脚本/Shizuku模式验证/resources/filemanager_icon.png");
            } catch (eS) { console.log("  save异常: " + eS.message); }
            let t2 = Date.now();
            let hit = images.findImage(home, tpl, { threshold: 0.9 });
            let fMs = Date.now() - t2;
            if (hit) {
                let cx = hit.x + 78, cy = hit.y + 78;
                report("2.机上裁剪模板→findImage", true,
                    "裁剪@(" + icx + "," + icy + ") 命中(" + cx + "," + cy + ") 耗时=" + fMs + "ms 模板保存=" + saved);

                // ===== 4. 全链路闭环: 截屏→找图→tap→前台变化 =====
                let fwBefore = String(sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'").result || "").trim().split("\n").pop();
                sh("input tap " + cx + " " + cy);
                sleep(2800);
                let fwAfter = String(sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'").result || "").trim().split("\n").pop();
                let left = !/launcher/i.test(fwAfter);
                report("4.全链路闭环(截屏→找图→tap→前台)", left, "前=[" + fwBefore.slice(0, 60) + "] 后=[" + fwAfter.slice(0, 60) + "]");
            } else {
                report("2.机上裁剪模板→findImage", false, "同源未命中(异常) 耗时=" + fMs + "ms");
                report("4.全链路闭环", false, "跳过");
            }
            tpl.recycle();
        } else {
            report("2/4.找图+闭环", false, "无OCR标签, 跳过");
        }

        // ===== 3. findMultiColors (相对偏移修正) =====
        try {
            let bx = Math.round(home.getWidth() / 2), by = Math.round(home.getHeight() / 2);
            let c1 = images.pixel(home, bx, by);
            let c2 = images.pixel(home, bx + 12, by + 12);
            let t3 = Date.now();
            let pt = images.findMultiColors(home, c1, [[12, 12, c2]], { region: [bx - 80, by - 80, 160, 160] });
            let mMs = Date.now() - t3;
            report("3.findMultiColors(相对偏移)", !!pt, "基准(" + bx + "," + by + ") 命中=" + (pt ? "(" + pt.x + "," + pt.y + ")" : "null") + " 耗时=" + mMs + "ms");
        } catch (eM) {
            report("3.findMultiColors", false, "异常: " + String(eM.message || eM).slice(0, 90));
        }

        home.recycle();
        sh("rm -f /sdcard/_v4b_home.png");
        sh("input keyevent 3");
    }
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f /sdcard/_v4b_home.png"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
