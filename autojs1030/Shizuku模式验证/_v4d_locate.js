// _v4d_locate.js — 闭环终测: 容错标签匹配 + 直点标签中心
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
    sh("screencap -p /sdcard/_v4d_home.png");
    let home = images.read("/sdcard/_v4d_home.png");

    // 容错标签匹配: 候选词包含匹配且总长≤6 (避免合并块)
    const CAND = ["笔记", "图库", "语雀", "iVCam", "Tinder", "听书2", "文件管理", "系统管家"];
    let hitLbl = null, hitB = null, allLabels = [];
    ocr.mode = "mlkit";
    let rs = ocr.detect(home);
    for (let i = 0; i < rs.length; i++) {
        let s = String(rs[i].label || rs[i].text || "").trim();
        if (s) allLabels.push(s);
        if (!hitLbl) {
            for (let k = 0; k < CAND.length; k++) {
                if (s.indexOf(CAND[k]) >= 0 && s.length <= 6) { hitLbl = CAND[k]; hitB = rs[i].bounds; break; }
            }
        }
    }
    console.log("  全部标签=[" + allLabels.join("|") + "]");
    if (hitB) {
        let cx = Math.round((hitB.left + hitB.right) / 2), cy = Math.round((hitB.top + hitB.bottom) / 2);
        let fwB = String(sh("dumpsys window 2>/dev/null | grep mCurrentFocus").result || "").trim().split("\n").pop();
        sh("input tap " + cx + " " + cy);
        sleep(2800);
        let fwA = String(sh("dumpsys window 2>/dev/null | grep mCurrentFocus").result || "").trim().split("\n").pop();
        report("1.全链路闭环(OCR标签→tap→前台变化)", !/launcher/i.test(fwA),
            "目标=" + hitLbl + "@(" + cx + "," + cy + ") 前=[" + fwB.slice(0, 50) + "] 后=[" + fwA.slice(0, 50) + "]");
        sh("input keyevent 3");
    } else {
        report("1.全链路闭环", false, "候选标签均未命中 (见上方标签表)");
    }

    home.recycle();
    sh("rm -f /sdcard/_v4d_home.png");
    sh("input keyevent 3");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f /sdcard/_v4d_home.png"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
