// _v4c_locate.js — v4 终版: OCR标签直点闭环 + findMultiColors 语义探针
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
    sh("am force-stop com.hihonor.notepad"); // 确保闭环起点干净(若包名不符则无副作用)
    sh("screencap -p /sdcard/_v4c_home.png");
    let home = images.read("/sdcard/_v4c_home.png");

    // ===== 1. OCR 找独立标签「笔记」→ 直点标签中心 → 前台验证 =====
    let lb = null;
    ocr.mode = "mlkit";
    let rs = ocr.detect(home);
    for (let i = 0; i < rs.length; i++) {
        let s = String(rs[i].label || rs[i].text || "").trim();
        if (s === "笔记" && !lb) lb = rs[i].bounds;
    }
    if (lb) {
        let cx = Math.round((lb.left + lb.right) / 2), cy = Math.round((lb.top + lb.bottom) / 2);
        // 模板: 图标+标签整条 (OCR bounds 上扩图标区)
        let tpl = images.clip(home, lb.left - 30, lb.top - 170, (lb.right - lb.left) + 60, (lb.bottom - lb.top) + 190);
        let hit = images.findImage(home, tpl, { threshold: 0.9 });
        report("1.OCR标签[笔记]+模板裁剪findImage", !!hit,
            "标签@(" + cx + "," + cy + ") 模板命中=" + (hit ? "(" + (hit.x + tpl.getWidth() / 2) + "," + (hit.y + tpl.getHeight() / 2) + ")" : "null"));

        let fwB = String(sh("dumpsys window 2>/dev/null | grep mCurrentFocus").result || "").trim().split("\n").pop();
        sh("input tap " + cx + " " + cy);
        sleep(2800);
        let fwA = String(sh("dumpsys window 2>/dev/null | grep mCurrentFocus").result || "").trim().split("\n").pop();
        report("2.全链路闭环(tap标签→前台变化)", !/launcher/i.test(fwA), "前=[" + fwB.slice(0, 55) + "] 后=[" + fwA.slice(0, 55) + "]");
        sh("input keyevent 3"); sleep(1000);
        tpl.recycle();
    } else {
        report("1/2.OCR闭环", false, "未找到独立标签「笔记」");
    }

    // ===== 3. findMultiColors 语义探针 =====
    let bx = Math.round(home.getWidth() / 2), by = Math.round(home.getHeight() / 2);
    let c1 = images.pixel(home, bx, by);
    let c2 = images.pixel(home, bx + 12, by + 12);
    console.log("  取样: c1=" + c1 + " c2=" + c2);
    let rA = null, rB = null, rC = null;
    try { rA = images.findColor(home, c1, { region: [bx - 80, by - 80, 160, 160] }); } catch (eA) { console.log("  findColor异常: " + eA.message); }
    try { rB = images.findMultiColors(home, c1, [[12, 12, c2]]); } catch (eB) { console.log("  findMultiColors无region异常: " + eB.message); }
    try { rC = images.findMultiColors(home, c1, [[12, 12, c2]], { region: [bx - 80, by - 80, 160, 160] }); } catch (eC) { console.log("  findMultiColors带region异常: " + eC.message); }
    let okM = !!(rA || rB || rC);
    report("3.findMultiColors探针", okM,
        "findColor=" + (rA ? "(" + rA.x + "," + rA.y + ")" : "null") + " | 无region=" + (rB ? "(" + rB.x + "," + rB.y + ")" : "null") + " | 带region=" + (rC ? "(" + rC.x + "," + rC.y + ")" : "null"));

    home.recycle();
    sh("rm -f /sdcard/_v4c_home.png");
    sh("input keyevent 3");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f /sdcard/_v4c_home.png"); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
