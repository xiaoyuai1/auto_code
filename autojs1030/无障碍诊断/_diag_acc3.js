// 诊断3: 枚举全部无障碍窗口, 找微信真实内容在哪个窗口
console.log("__START__");
auto();
let svc = auto.service;
let windows = svc.getWindows ? svc.getWindows() : null;
if (!windows || windows.size() === 0) {
    console.error("getWindows 为空或不可用 (需 FLAG_RETRIEVE_INTERACTIVE_WINDOWS)");
} else {
    console.log("窗口总数: " + windows.size());
    for (let i = 0; i < windows.size(); i++) {
        let w = windows.get(i);
        let r = w.getRoot();
        let cnt = r ? r.getChildCount() : -1;
        let pkg = r && r.getPackageName() ? String(r.getPackageName()) : "?";
        let sample = "";
        if (r && cnt > 0) {
            // 深挖找第一个有文本的节点
            function first(node, d) {
                if (!node || d > 15) return null;
                let t = node.getText() ? String(node.getText()) : "";
                let dd = node.getContentDescription() ? String(node.getContentDescription()) : "";
                if (t || dd) return "[" + d + "]" + (t || dd);
                for (let k = 0; k < node.getChildCount(); k++) {
                    let x = first(node.getChild(k), d + 1);
                    if (x) return x;
                }
                return null;
            }
            sample = first(r, 0) || "";
        }
        console.log("窗口" + i + ": type=" + w.getType() + " layer=" + w.getLayer()
            + " active=" + w.isActive() + " focused=" + w.isFocused() + " pkg=" + pkg
            + " rootChildren=" + cnt + " sample=" + sample);
    }
}
console.log("__DONE__");
