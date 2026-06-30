/** cap sync 后：注入 iOS 下载/图片保存桥接 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iosApp = path.join(root, 'ios/App/App');

if (!fs.existsSync(iosApp)) {
  console.error('::error::ios/App missing — run npx cap add ios first');
  process.exit(1);
}

// 1. Write DownloadHandler.swift
const swiftCode = `import UIKit
import Photos
import WebKit

class DownloadHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String else { return }
        if message.name == "saveImageUrl" {
            guard let url = URL(string: body) else { return }
            URLSession.shared.dataTask(with: url) { data, _, error in
                guard let data = data, error == nil, let image = UIImage(data: data) else { return }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                }, completionHandler: { success, _ in
                    DispatchQueue.main.async {
                        if success {
                            self.showToast("图片已保存到相册")
                        } else {
                            self.showToast("保存失败")
                        }
                    }
                })
            }.resume()
        } else if message.name == "saveImage" {
            var pure = body
            if let idx = pure.firstIndex(of: ",") {
                pure = String(pure[pure.index(after: idx)...])
            }
            guard let data = Data(base64Encoded: pure), let image = UIImage(data: data) else { return }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }, completionHandler: { success, _ in
                DispatchQueue.main.async {
                    if success {
                        self.showToast("图片已保存到相册")
                    } else {
                        self.showToast("保存失败")
                    }
                }
            })
        }
    }

    private func showToast(_ msg: String) {
        DispatchQueue.main.async {
            guard let window = UIApplication.shared.windows.first(where: { $0.isKeyWindow }) else { return }
            let label = UILabel()
            label.text = msg
            label.textColor = .white
            label.backgroundColor = UIColor.black.withAlphaComponent(0.7)
            label.textAlignment = .center
            label.font = .systemFont(ofSize: 14, weight: .medium)
            label.layer.cornerRadius = 8
            label.clipsToBounds = true
            label.frame = CGRect(x: 40, y: window.bounds.height - 120, width: window.bounds.width - 80, height: 40)
            window.addSubview(label)
            UIView.animate(withDuration: 0.3, delay: 2.0, options: .curveEaseOut) {
                label.alpha = 0
            } completion: { _ in
                label.removeFromSuperview()
            }
        }
    }
}
`;
fs.writeFileSync(path.join(iosApp, 'DownloadHandler.swift'), swiftCode, 'utf8');
console.log('patch-ios-download: DownloadHandler.swift created');

// 2. Patch AppDelegate.swift
const appDelegatePath = path.join(iosApp, 'AppDelegate.swift');
let appDelegate = fs.readFileSync(appDelegatePath, 'utf8');

// Add import for WebKit if missing
if (!appDelegate.includes('import WebKit')) {
  appDelegate = appDelegate.replace(/import UIKit/, 'import UIKit\nimport WebKit');
}

// Add download handler property and registration
if (!appDelegate.includes('downloadHandler')) {
  // Add property
  appDelegate = appDelegate.replace(
    /@UIApplicationMain/,
    '@UIApplicationMain'
  );

  // Insert handler property and registration before closing brace
  const insertPoint = appDelegate.lastIndexOf('}');
  const handlerSetup = `
    let downloadHandler = DownloadHandler()

    func registerDownloadHandler(webView: WKWebView) {
        webView.configuration.userContentController.add(downloadHandler, name: "saveImageUrl")
        webView.configuration.userContentController.add(downloadHandler, name: "saveImage")
    }
`;
  appDelegate = appDelegate.slice(0, insertPoint) + handlerSetup + appDelegate.slice(insertPoint);
}

fs.writeFileSync(appDelegatePath, appDelegate, 'utf8');
console.log('patch-ios-download: AppDelegate.swift patched');

// 3. Write the JavaScript bridge
const jsBridge = `(function(){
  if(!window.webkit||!window.webkit.messageHandlers)return;
  function intercept(e){
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
  document.addEventListener('click',intercept,true);
  var oc=document.createElement.bind(document);
  document.createElement=function(tag){
    var el=oc(tag);
    if(tag.toLowerCase()==='a'){
      var oc2=el.click.bind(el);
      el.click=function(){
        if(el.hasAttribute('download')){
          var h=el.href||el.getAttribute('href')||'';
          if(h.indexOf('blob:')===0){var x=new XMLHttpRequest();x.open('GET',h,true);x.responseType='blob';x.onload=function(){var r=new FileReader();r.onloadend=function(){window.webkit.messageHandlers.saveImage.postMessage(r.result);};r.readAsDataURL(x.response);};x.send();return;}
          if(h.indexOf('data:image')===0){window.webkit.messageHandlers.saveImage.postMessage(h);return;}
          if(h&&h.indexOf('http')===0){window.webkit.messageHandlers.saveImageUrl.postMessage(h);return;}
        }
        return oc2();
      };
    }
    return el;
  };
})();`;
fs.writeFileSync(path.join(iosApp, 'download-bridge.js'), jsBridge, 'utf8');
console.log('patch-ios-download: download-bridge.js created');

// 4. Patch CAPBridgeViewController.swift to register handler + inject JS
const vcPath = path.join(iosApp, 'CAPBridgeViewController.swift');
if (fs.existsSync(vcPath)) {
  let vc = fs.readFileSync(vcPath, 'utf8');

  // Find the webview creation and add script injection + handler registration
  // Look for where the bridge/webview is configured
  if (!vc.includes('downloadHandler') && !vc.includes('download-bridge')) {
    // Try to find webView load or config point
    const patterns = [
      { find: /bridge\s*=\s*CAPBridge/g, replace: 'bridge' },
      { find: /webView\s*=\s*CAPWebView/g, replace: 'webView' },
    ];

    // Simpler approach: add viewDidLoad override that registers after a delay
    const hookCode = `
    // Download bridge injection
    open override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if let webView = self.bridge?.webView {
                self.bridge?.registerPluginInstance(DownloadHandler())
                if let bundlePath = Bundle.main.path(forResource: "download-bridge", ofType: "js"),
                   let js = try? String(contentsOfFile: bundlePath, encoding: .utf8) {
                    let script = WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
                    webView.configuration.userContentController.addUserScript(script)
                    webView.configuration.userContentController.add(DownloadHandler(), name: "saveImageUrl")
                    webView.configuration.userContentController.add(DownloadHandler(), name: "saveImage")
                }
            }
        }
    }
`;

    // Check if there's already a viewDidAppear
    if (vc.includes('viewDidAppear')) {
      // Add injection code inside existing viewDidAppear
      vc = vc.replace(
        /(open override func viewDidAppear\(_ animated: Bool)\s*\{[\s\S]*?super\.viewDidAppear\(animated\))/,
        `$1
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            if let webView = self.bridge?.webView {
                if let bundlePath = Bundle.main.path(forResource: "download-bridge", ofType: "js"),
                   let js = try? String(contentsOfFile: bundlePath, encoding: .utf8) {
                    let script = WKUserScript(source: js, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
                    webView.configuration.userContentController.addUserScript(script)
                    let handler = DownloadHandler()
                    webView.configuration.userContentController.add(handler, name: "saveImageUrl")
                    webView.configuration.userContentController.add(handler, name: "saveImage")
                }
            }
        }`
      );
    } else {
      // Insert before the last closing brace
      const lastBrace = vc.lastIndexOf('}');
      vc = vc.slice(0, lastBrace) + hookCode + vc.slice(lastBrace);
    }

    fs.writeFileSync(vcPath, vc, 'utf8');
    console.log('patch-ios-download: CAPBridgeViewController.swift patched');
  } else {
    console.log('patch-ios-download: CAPBridgeViewController already patched');
  }
} else {
  console.log('patch-ios-download: CAPBridgeViewController.swift not found');
}

console.log('patch-ios-download: OK');
