/**
 * 全量探测: 所有非系统应用 + 系统应用中关键词命中者
 * plugins.load 通过 = 已安装且在插件中心授权的插件
 * FAIL 明细聚合, OK 明细逐条 + 导出对象结构
 */

var KW = /(autojs|auto\.js|autox|xiaoyu|plugin|opencv|yolo|ocr|mlkit)/i;

function metaKeys(ai) {
    try {
        if (!ai.metaData) return "";
        let it = ai.metaData.keySet().iterator(), ks = [];
        while (it.hasNext()) ks.push(String(it.next()));
        return ks.join(",");
    } catch (e) { return ""; }
}

function main() {
    let PM = context.getPackageManager();
    let pkgs = PM.getInstalledPackages(android.content.pm.PackageManager.GET_META_DATA);
    let n = pkgs.size();
    let self = context.getPackageName();
    console.log("TOTAL_INSTALLED=" + n + " SELF=" + self);

    let cands = [];
    for (let i = 0; i < n; i++) {
        let pi = pkgs.get(i);
        let ai = pi.applicationInfo;
        let isSys = (ai.flags & 1) !== 0;
        let label = "";
        try { label = String(ai.loadLabel(PM)); } catch (e) {}
        let pkg = String(pi.packageName);
        if (pkg === self) continue;
        let meta = metaKeys(ai);
        if (!isSys || KW.test(pkg) || KW.test(label) || KW.test(meta)) {
            cands.push({ pkg: pkg, label: label, ver: String(pi.versionName || ""), meta: meta });
        }
    }
    console.log("CANDIDATES=" + cands.length);

    let okList = [], failList = [];
    for (let i = 0; i < cands.length; i++) {
        let c = cands[i], ok = false, detail = "", exp = "";
        try {
            let m = plugins.load(c.pkg);
            ok = true;
            detail = "type=" + typeof m;
            try {
                if (m && typeof m === "object") exp = "keys=[" + Object.keys(m).join(",") + "]";
                else if (m && typeof m === "function") exp = "fnName=" + (m.name || "?");
            } catch (e2) {}
        } catch (e) {
            detail = String((e && e.message) || e);
            // 去掉堆栈尾巴, 只留首行原因
            let cut = detail.indexOf(" ($");
            if (cut > 0) detail = detail.slice(0, cut);
        }
        if (ok) {
            okList.push("PLUGIN_OK|" + c.pkg + "|" + c.label + "|v" + c.ver + "|" + detail + "|" + exp);
        } else {
            failList.push(c.pkg + " => " + detail);
        }
    }

    console.log("== 已授权插件 (" + okList.length + ") ==");
    okList.forEach(function (l) { console.log(l); });
    console.log("== 未授权/非插件 (" + failList.length + ") ==");
    // 聚合打印: 每行 3 个, 控制日志量
    for (let j = 0; j < failList.length; j += 3) {
        console.log("FAIL " + failList.slice(j, j + 3).join("  ||  "));
    }
    console.log("__DONE__");
}

try {
    main();
} catch (e) {
    console.error("探测失败: " + e + "\n" + (e && e.stack || ""));
    console.log("__DONE__");
}
