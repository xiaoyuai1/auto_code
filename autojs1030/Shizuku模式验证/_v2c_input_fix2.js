// _v2c_input_fix2.js — v2 失败项二次补测 (clear-top 回主页 / 点文件Tab再长按)
console.log("__START__");

const DUMP = "/sdcard/_v2c_dump.xml";
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
    // ===== 1. tap[蓝牙]: clear-top 强制设置回主页 =====
    sh("input keyevent 3"); sleep(600);
    sh("am start --activity-clear-top -a android.settings.SETTINGS"); sleep(2000);
    let xml1 = dumpXml();
    let n1 = xml1 ? nodeByText(xml1, "蓝牙") : null;
    if (!n1 && xml1) { console.log("  设置主页文本: " + textsOf(xml1).slice(0, 12).join("|")); }
    if (n1) {
        let t1 = textsOf(xml1).join(",");
        sh("input tap " + n1.cx + " " + n1.cy); sleep(1700);
        let xml2 = dumpXml();
        let t2 = xml2 ? textsOf(xml2).join(",") : "";
        report("1.input tap[蓝牙]→内容变化", !!xml2 && t2 !== t1, "前[" + t1.slice(0, 45) + "] 后[" + t2.slice(0, 45) + "]");
        sh("input keyevent 4"); sleep(1100);
    } else {
        report("1.input tap[蓝牙]", false, "clear-top 后仍未见蓝牙");
    }

    // ===== 2/3. 设置搜索框 ASCII + 中文 =====
    let xml3 = dumpXml();
    let ns = xml3 ? nodeByText(xml3, "搜索设置项") : null;
    if (ns) {
        sh("input tap " + ns.cx + " " + ns.cy); sleep(1600);
        sh("input text wifi_test_9x"); sleep(1300);
        let xml4 = dumpXml();
        report("2.input text ASCII(搜索框回显)", !!xml4 && xml4.indexOf("wifi_test_9x") >= 0, xml4 ? "回显探测完成" : "dump失败");
        sh("input text 中文测试蓝牙"); sleep(1300);
        let xml5 = dumpXml();
        let cn = !!(xml5 && xml5.indexOf("中文测试") >= 0);
        report("3.input text 中文", cn, cn ? "意外: 中文可输入" : "符合预期: 未上屏 → v6 走 setClip+粘贴");
        sh("input keyevent 4"); sleep(700); sh("input keyevent 4"); sleep(700);
    } else {
        report("2/3.input text", false, "未找到「搜索设置项」");
    }

    // ===== 4. AutoJs6 主页: 点文件Tab → 长按 autojs1030 =====
    sh("am start --activity-clear-top -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(2000);
    let xml6 = dumpXml();
    let ntab = xml6 ? nodeByText(xml6, "文件") : null;
    if (ntab) {
        sh("input tap " + ntab.cx + " " + ntab.cy); sleep(1200);
    }
    let xml7 = dumpXml();
    let nf = xml7 ? nodeByText(xml7, "autojs1030") : null;
    if (!nf && xml7) console.log("  文件页文本: " + textsOf(xml7).slice(0, 12).join("|"));
    if (nf) {
        sh("input swipe " + nf.cx + " " + nf.cy + " " + nf.cx + " " + nf.cy + " 900"); sleep(1500);
        let xml8 = dumpXml();
        let menuHit = xml8 && /重命名|删除|属性|详情|快捷方式|压缩|发送|移动/.test(xml8);
        report("4.长按[autojs1030]弹菜单", !!menuHit, xml8 ? "弹层文本: " + (textsOf(xml8).slice(0, 14).join("|")).slice(0, 150) : "dump失败");
        sh("input keyevent 4"); sleep(900);
    } else {
        report("4.长按", false, "文件页未见 autojs1030 (可能需滚动)");
    }

    sh("input keyevent 3");
    sh("rm -f " + DUMP);
} catch (e) {
    console.error("全局异常: " + e.message + " | " + e.stack);
    report("全局异常", false, e.message);
    try { shizuku("rm -f " + DUMP); shizuku("input keyevent 3"); } catch (e2) {}
}

console.log("== 汇总: PASS=" + pass + " FAIL=" + fail + " ==");
console.log("__DONE__");
