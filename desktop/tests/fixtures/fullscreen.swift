import AppKit
import CoreGraphics
let target = Int(CommandLine.arguments[1])!
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x:100,y:100,width:900,height:650), styleMask:[.titled,.closable,.resizable,.miniaturizable], backing:.buffered, defer:false)
window.title = "Hustle fullscreen verification"
window.backgroundColor = .darkGray
window.collectionBehavior = [.fullScreenPrimary]
func check(_ stage:String) {
 let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly,.excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
 let matching = list.filter { ($0[kCGWindowOwnerPID as String] as? Int) == target }
 let report: [String:Any] = ["stage":stage, "nativeFullscreen":window.styleMask.contains(.fullScreen), "windows":matching.map { ["layer":$0[kCGWindowLayer as String] ?? -1, "bounds":$0[kCGWindowBounds as String] ?? [:]] }]
 let data = try! JSONSerialization.data(withJSONObject:report)
 print(String(data:data, encoding:.utf8)!)
 fflush(stdout)
}
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps:true)
DispatchQueue.main.asyncAfter(deadline:.now()+1) { check("BEFORE");window.toggleFullScreen(nil) }
DispatchQueue.main.asyncAfter(deadline:.now()+4) { check("FULLSCREEN");window.toggleFullScreen(nil) }
DispatchQueue.main.asyncAfter(deadline:.now()+6) { app.terminate(nil) }
app.run()
