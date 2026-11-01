// 一次性: 打印当前屏幕全部 OCR 文本+坐标 (选主界面判定特征用)
console.log("__START__");
auto();
if (!images.requestScreenCapture()) { console.error('截屏失败'); exit(); }
sleep(500);
var img = images.captureScreen();
var rs = ocr.detect(img);
console.log('总项数: ' + rs.length);
for (var i = 0; i < rs.length; i++) {
    var r = rs[i];
    var t = String(r.label || r.text || '');
    var b = r.bounds;
    if (!b) continue;
    console.log('[' + i + '] "' + t + '" @' + b.left + ',' + b.top + '-' + b.right + ',' + b.bottom + ' conf=' + (r.confidence || 0).toFixed(2));
}
console.log("__DONE__");
