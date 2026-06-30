/** cap sync 后：注入 iOS 下载/图片保存桥接（全部嵌入 AppDelegate，不创建新文件） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iosApp = path.join(root, 'ios/App/App');

if (!fs.existsSync(iosApp)) {
  console.error('::error::ios/App missing — run npx cap add ios first');
  process.exit(1);
}

// 1. Write the JS bridge file
const jsBridge = `(function(){
  if(!window.webkit||!window.webkit.messageHandlers)return;
  function handleClick(e){
    var t=e.target;
    while(t&&t!==document){
      var a=t.tagName==='A'?t:t.closest('a');
      if(a&&a.hasAttribute('download')){
        e.preventDefault();e.stopPropagation();
        var h=a.href||a.getAttribute('href')||'';
        if(h.indexOf('blob:')===0){
          var x=new XMLHttpRequest();x.open('GET',h,true);x.responseType='blob';
          x.onload=function(){var r=new FileReader();r.onloadend=function(){window.webkit.messageHandlers.saveImage.postMessage(r.result);};r.readAsDataURL(x.response);};x.send();
        }else if(h.indexOf('data:image')===0){
          window.webkit.messageHandlers.saveImage.postMessage(h);
        }else if(h&&h.indexOf('http')===0){
          window.webkit.messageHandlers.saveImageUrl.postMessage(h);
        }
        return false;
      }
      t=t.parentNode;
    }
  }
  document.addEventListener('click',handleClick,true);
  var oc=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=oc(tag);
    if(tag.toLowerCase()==='a'){
      var origClick=el.click.bind(el);
      el.click=function(){
        if(el.hasAttribute('download')){
          var h=el.href||el.getAttribute('href')||'';
          if(h.indexOf('blob:')===0){var x=new XMLHttpRequest();x.open('GET',h,true);x.responseType='blob';x.onload=function(){var r=new FileReader();r.onloadend=function(){window.webkit.messageHandlers.saveImage.postMessage(r.result);};r.readAsDataURL(x.response);};x.send();return;}
          if(h.indexOf('data:image')===0){window.webkit.messageHandlers.saveImage.postMessage(h);return;}
          if(h&&h.indexOf('http')===0){window.webkit.messageHandlers.saveImageUrl.postMessage(h);return;}
        }
        return origClick();
      };
    }
    return el;
  };
})();`;
fs.writeFileSync(path.join(iosApp, 'download-bridge.js'), jsBridge, 'utf8');
console.log('patch-ios-download: download-bridge.js created');

// 2. Patch AppDelegate.swift — embed handler + register message handlers + inject JS
const appDelegatePath = path.join(iosApp, 'AppDelegate.swift');
let appDelegate = fs.readFileSync(appDelegatePath, 'utf8');

// Add imports
if (!appDelegate.includes('import Photos')) {
  appDelegate = appDelegate.replace(/import UIKit/, 'import UIKit\nimport Photos');
}
if (!appDelegate.includes('import WebKit')) {
  appDelegate = appDelegate.replace(/import UIKit/, 'import UIKit\nimport WebKit');
}

// Remove any leftover DownloadHandler class from previous attempts
appDelegate = appDelegate.replace(/class DownloadHandler[\s\S]*?^}/gm, '');

// Add DownloadHandler class and registration before the closing brace of the class
const downloadHandlerClass = `

// MARK: - Download Handler
class DownloadHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }
        if message.name == "saveImageUrl" {
            guard let url = URL(string: body) else { return }
            URLSession.shared.dataTask(with: url) { data, _, error in
                guard let data = data, error == nil, let image = UIImage(data: data) else { return }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }, completionHandler: { _, _ in })
            }.resume()
        } else if message.name == "saveImage" {
            var pure = body
            if let idx = pure.firstIndex(of: ",") { pure = String(pure[pure.index(after: idx)...]) }
            guard let data = Data(base64Encoded: pure), let image = UIImage(data: data) else { return }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }, completionHandler: { _, _ in })
        }
    }
}
`;

// Add downloadHandler property and injection method
if (!appDelegate.includes('downloadBridgeHandler')) {
  const insertPoint = appDelegate.lastIndexOf('}');
  const setup = `
    let downloadBridgeHandler = DownloadHandler()

    func injectDownloadBridge(_ webView: WKWebView) {
        let ctrl = webView.configuration.userContentController
        ctrl.add(downloadBridgeHandler, name: "saveImageUrl")
        ctrl.add(downloadBridgeHandler, name: "saveImage")
        if let path = Bundle.main.path(forResource: "download-bridge", ofType: "js"),
           let js = try? String(contentsOfFile: path, encoding: .utf8) {
            let script = WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            ctrl.addUserScript(script)
        }
    }
`;
  appDelegate = appDelegate.slice(0, insertPoint) + downloadHandlerClass + setup + appDelegate.slice(insertPoint);
}

fs.writeFileSync(appDelegatePath, appDelegate, 'utf8');
console.log('patch-ios-download: AppDelegate.swift patched with DownloadHandler');

// 3. Patch CAPBridgeViewController.swift to call injectDownloadBridge
const vcPath = path.join(iosApp, 'CAPBridgeViewController.swift');
if (fs.existsSync(vcPath)) {
  let vc = fs.readFileSync(vcPath, 'utf8');
  if (!vc.includes('injectDownloadBridge')) {
    // Find the viewDidAppear or viewDidLoad and add injection
    if (vc.includes('viewDidAppear')) {
      vc = vc.replace(
        /(super\.viewDidAppear\(animated\))/,
        `$1
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if let webView = self.bridge?.webView {
                (UIApplication.shared.delegate as? AppDelegate)?.injectDownloadBridge(webView)
            }
        }`
      );
    } else if (vc.includes('viewDidLoad')) {
      vc = vc.replace(
        /(super\.viewDidLoad\(\))/,
        `$1
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            if let webView = self.bridge?.webView {
                (UIApplication.shared.delegate as? AppDelegate)?.injectDownloadBridge(webView)
            }
        }`
      );
    }
    fs.writeFileSync(vcPath, vc, 'utf8');
    console.log('patch-ios-download: CAPBridgeViewController.swift patched');
  } else {
    console.log('patch-ios-download: CAPBridgeViewController already patched');
  }
} else {
  // Try to find the actual view controller file
  const files = fs.readdirSync(iosApp).filter(f => f.endsWith('.swift'));
  console.log('patch-ios-download: CAPBridgeViewController.swift not found, Swift files:', files.join(', '));
}

console.log('patch-ios-download: OK');
