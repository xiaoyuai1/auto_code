// 诊断2: Java 风格遍历 AccessibilityNodeInfo, 验证微信页面可抓性
console.log("__START__");
auto();
let root = auto.rootInActiveWindow;
if (!root) { console.error("rootInActiveWindow=null"); console.log("__DONE__"); exit(); }
console.log("root pkg=" + root.getPackageName() + " children=" + root.getChildCount());

let n = 0, total = 0;
function walk(node, depth) {
    if (!node || depth > 20) return;
    total++;
    let txt = node.getText() ? String(node.getText()) : "";
    let desc = node.getContentDescription() ? String(node.getContentDescription()) : "";
    let vid = node.getViewIdResourceName() ? String(node.getViewIdResourceName()) : "";
    let cls = node.getClassName() ? String(node.getClassName()) : "";
    if ((txt || desc) && n < 25) {
        n++;
        console.log("[" + depth + "] " + cls + " | id=" + vid + " | t=" + txt + " | d=" + desc + " | clk=" + node.isClickable());
    }
    for (let i = 0; i < node.getChildCount(); i++) walk(node.getChild(i), depth + 1);
}
walk(root, 0);
console.log("总计节点=" + total + " 有文本节点=" + n);
console.log("__DONE__");
