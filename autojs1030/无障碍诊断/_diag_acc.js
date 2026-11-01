// 诊断: 无障碍服务状态 + 微信页面可抓性
console.log("__START__");
try {
    auto(); // 确保无障碍服务
    console.log("auto() ok");
} catch (e) {
    console.error("auto() 失败: " + e);
}

let svc = auto.service;
console.log("auto.service = " + svc);

let root = auto.rootInActiveWindow;
if (root) {
    console.log("root package=" + root.package() + " childCount=" + root.childCount());
    // 打印前 20 个有文本/desc 的节点
    let n = 0;
    let walk = function (node, depth) {
        if (!node || n >= 20 || depth > 12) return;
        let txt = node.text() || "";
        let desc = node.desc() || "";
        let id = node.id() || "";
        if (txt || desc || id) {
            console.log("  [" + depth + "] " + node.className() + " id=" + id + " text=" + txt + " desc=" + desc);
            n++;
        }
        for (let i = 0; i < node.childCount(); i++) walk(node.child(i), depth + 1);
    };
    walk(root, 0);
    console.log("有标识节点数: " + n);
} else {
    console.error("rootInActiveWindow = null → 无障碍未生效或被目标应用屏蔽");
}
console.log("__DONE__");
