// _v2b_input_fix.js — v2 失败项补测 (tap判据改内容变化 / 显式am start / 设置搜索框文本靶)
console.log("__START__");

const DUMP = "/sdcard/_v2b_dump.xml";
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
    // 精确 text 匹配 (text="xxx" 完整值)
    let m = xml.match(new RegExp('text="' + exact + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"'));
    if (!m) return null;
    return { cx: Math.round((+m[1] + +m[3]) / 2), cy: Math.round((+m[2] + +m[4]) / 2) };
}
function focusLast() {
    let r = sh("dumpsys window 2>/dev/null | grep -E 'mCurrentFocus'");
    let lines = String(r && r.result || "").trim().split("\n");
    return lines[lines.length - 1].trim();
}

try {
    // ===== 1. tap 判据修正: 点「蓝牙」→ 内容变化 =====
    sh("am start -a android.settings.SETTINGS"); sleep(1800);
    let xml1 = dumpXml();
    let n1 = xml1 ? nodeByText(xml1, "蓝牙") : null;
    let t1 = xml1 ? textsOf(xml1).join(",") : "";
    if (n1) {
        sh("input tap " + n1.cx + " " + n1.cy); sleep(1600);
        let xml2 = dumpXml();
        let t2 = xml2 ? textsOf(xml2).join(",") : "";
        let f2 = focusLast();
        report("1.input tap[蓝牙]→页面内容变化", !!xml2 && (t2 !== t1 || /Bluetooth|蓝牙/i.test(f2)), "焦点=" + f2.slice(0, 90) + " 文本前[" + t1.slice(0, 40) + "]后[" + t2.slice(0, 40) + "]");
        sh("input keyevent 4"); sleep(1200);
    } else {
        report("1.input tap[蓝牙]", false, "设置主页无「蓝牙」文本");
    }

    // ===== 2. 设置搜索框: ASCII + 中文 =====
    let xml3 = dumpXml();
    let ns = xml3 ? nodeByText(xml3, "搜索设置项") : null;
    if (ns) {
        sh("input tap " + ns.cx + " " + ns.cy); sleep(1500);
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

    // ===== 4. AutoJs6 主页长按 (显式组件启动) =====
    sh("input keyevent 3"); sleep(800);
    sh("am start -n com.xiaoyu.ai/org.autojs.autojs.ui.main.MainActivity"); sleep(2000);
    let xml6 = dumpXml();
    let nf = xml6 ? nodeByText(xml6, "autojs1030") : null;
    if (!nf && xml6) {
        // 主页可能在别的 Tab/页, 记录现状
        console.log("  主页文本: " + textsOf(xml6).slice(0, 10).join("|"));
    }
    if (nf) {
        sh("input swipe " + nf.cx + " " + nf.cy + " " + nf.cx + " " + nf.cy + " 900"); sleep(1500);
        let xml7 = dumpXml();
        let menuHit = xml7 && /重命名|删除|属性|详情|快捷方式|压缩|发送/.test(xml7);
        report("4.长按[autojs1030]弹菜单", !!menuHit, xml7 ? "弹层文本: " + (textsOf(xml7).slice(0, 14).join("|")).slice(0, 150) : "dump失败");
        sh("input keyevent 4"); sleep(900);
    } else {
        report("4.长按", false, "主页未见 autojs1030 条目");
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
