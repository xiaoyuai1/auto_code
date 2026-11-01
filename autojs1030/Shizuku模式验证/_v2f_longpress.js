// _v2f_longpress.js — 长按终测: motionevent DOWN/UP 无MOVE (零位移swipe会被当点击)
console.log("__START__");

const DUMP = "/sdcard/_v2f_dump.xml";
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
function dumpXml(retry) {
    for (let i = 0; i < (retry || 3); i++) {
        let r = sh("uiautomator dump " + DUMP);
        if (r && r.code === 0 && files.exists(DUMP)) {
            let s = files.read(DUMP);
            if (s && s.indexOf("<node") >= 0) return s;
        }
        sleep(800);
    }
    return null;
}
function textsOf(xml) {
    let out = [], re = /text="([^"]+)"/g, m;
    while ((m = re.exec(xml))) { if (m[1].length <= 40) out.push(m[1]); }
    return out;
}
function nodeByText(xml, exact) {
    let m = xml.match(new RegExp('text="' + exact + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"'));
    if (!m) return null;
    return { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) };
}

try {
    sh("input keyevent 3"); sleep(600);
    sh("am start -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(1800);
    sh("input tap 160 420"); sleep(1000); // 文件 Tab

    let nf = null;
    for (let i = 0; i < 5 && !nf; i++) {
        let x = dumpXml();
        if (!x) break;
        nf = nodeByText(x, "autojs1030");
        if (nf) break;
        console.log("  第" + (i + 1) + "次退回: " + textsOf(x).slice(0, 6).join("|"));
        sh("input keyevent 4"); sleep(1000);
    }

    if (nf) {
        console.log("  长按目标: (" + nf.cx + "," + nf.cy + ")");
        sh("input motionevent DOWN " + nf.cx + " " + nf.cy);
        sleep(950);
        sh("input motionevent UP " + nf.cx + " " + nf.cy);
        sleep(1600);
        let xml3 = dumpXml();
        let menuHit = xml3 && /重命名|删除|属性|详情|快捷方式|压缩|发送|移动/.test(xml3);
        report("1.长按motionevent[autojs1030]弹菜单", !!menuHit, xml3 ? "弹层文本: " + (textsOf(xml3).slice(0, 14).join("|")).slice(0, 150) : "dump失败");
        sh("input keyevent 4"); sleep(900);
    } else {
        report("1.长按", false, "根列表未找到 autojs1030");
    }

    sh("input keyevent 3");
    sh("rm -f " + DUMP + " /sdcard/_v2e_search.png");
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f " + DUMP); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
