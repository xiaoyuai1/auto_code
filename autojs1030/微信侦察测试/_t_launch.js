// 测试: 三种方式从后台拉起微信 (MagicOS 后台启动管控排查)
console.log("__START__");
var WX = 'com.tencent.mm';
function W() { return device.width; } function H() { return device.height; }
function mainVisible() {
    var img = images.captureScreen();
    if (!img) { console.warn('captureScreen=null'); return 'capture-null'; }
    var rs; try { rs = ocr.detect(img); } catch (e) { return 'ocr-err'; }
    var texts = [];
    for (var i = 0; i < rs.length; i++) texts.push(String(rs[i].label || rs[i].text || ''));
    for (var k = 0; k < rs.length; k++) {
        var b = rs[k].bounds;
        if (b && b.centerY() > 0.9 * H() && (String(rs[k].label || rs[k].text || '')).indexOf('通讯录') >= 0) return 'MAIN';
    }
    return 'not-main(items=' + rs.length + ': ' + texts.slice(0, 4).join('/') + ')';
}

console.log('launch 前 currentPackage=' + currentPackage());
console.log('A app.launch: ' + app.launch(WX));
sleep(3500);
console.log('A 结果: ' + mainVisible());

if (true) {
    console.log('B app.launchPackage: ' + app.launchPackage(WX));
    sleep(3500);
    console.log('B 结果: ' + mainVisible());
}
if (true) {
    var sh = shell('am start -n com.tencent.mm/.ui.LauncherUI', false);
    sleep(3500);
    console.log('C shell am start: code=' + sh.code + ' out=' + String(sh.result || sh.error || '').slice(0, 120));
    console.log('C 结果: ' + mainVisible());
}
console.log('__DONE__');
