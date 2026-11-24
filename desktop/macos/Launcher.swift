import AppKit
import Foundation
import WebKit
import Darwin

private var serverPID: pid_t = 0

private func installSignalHandlers() {
  for signalNumber in [SIGTERM, SIGINT] {
    signal(signalNumber) { _ in
      if serverPID > 0 {
        kill(serverPID, SIGTERM)
      }
      _exit(0)
    }
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var server: Process?
  private var logFile: FileHandle?
  private var logPipe: Pipe?
  private var terminating = false

  func applicationDidFinishLaunching(_ notification: Notification) {
    installMenu()
    installSignalHandlers()

    guard let root = resolveWorkspace() else {
      AppDelegate.alert("Workspace required", "Choose a project folder to open Anneal IDE.")
      NSApp.terminate(nil)
      return
    }

    guard let helper = Bundle.main.url(forResource: "anneal-server", withExtension: nil) else {
      AppDelegate.alert("Missing server", "The embedded Anneal server could not be found in this app bundle.")
      NSApp.terminate(nil)
      return
    }

    let port = freePort()
    let baseURL = URL(string: "http://127.0.0.1:\(port)")!
    presentWindow()

    do {
      try startServer(helper, workspace: root, port: port)
    } catch {
      AppDelegate.alert("Could not start Anneal", error.localizedDescription)
      NSApp.terminate(nil)
      return
    }

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      let ready = Self.waitForServer(baseURL.appendingPathComponent("api/health"))
      DispatchQueue.main.async {
        guard let self, !self.terminating else { return }
        if ready {
          self.webView.load(URLRequest(url: baseURL))
        } else {
          self.webView.loadHTMLString(Self.errorHTML, baseURL: nil)
        }
      }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  func applicationWillTerminate(_ notification: Notification) {
    terminating = true
    logPipe?.fileHandleForReading.readabilityHandler = nil
    if let server, server.isRunning {
      server.terminate()
    }
    try? logFile?.close()
  }

  // MARK: - Workspace

  private func resolveWorkspace() -> String? {
    let args = Array(CommandLine.arguments.dropFirst())

    // Explicit flags win, then a bare folder argument.
    for (index, arg) in args.enumerated() {
      if (arg == "--workspace" || arg == "-w"), index + 1 < args.count {
        return absoluteDirectory(args[index + 1])
      }
      if arg.hasPrefix("--workspace=") {
        return absoluteDirectory(String(arg.dropFirst("--workspace=".count)))
      }
    }
    for arg in args where !arg.hasPrefix("-") {
      if let path = absoluteDirectory(arg) {
        return path
      }
    }

    let preference = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".anneal/workspace.json")
    if let data = try? Data(contentsOf: preference),
       let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let saved = object["workspaceRoot"] as? String,
       let path = absoluteDirectory(saved) {
      return path
    }

    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.allowsMultipleSelection = false
    panel.message = "Choose the project folder Anneal should open"
    panel.prompt = "Open Project"
    guard panel.runModal() == .OK, let url = panel.url else { return nil }
    writeWorkspacePreference(url.path)
    return url.path
  }

  private func absoluteDirectory(_ input: String) -> String? {
    let expanded = NSString(string: input.trimmingCharacters(in: .whitespacesAndNewlines))
      .expandingTildeInPath
    guard !expanded.isEmpty else { return nil }
    let url = URL(fileURLWithPath: expanded, relativeTo: URL(fileURLWithPath: FileManager.default.currentDirectoryPath))
      .standardizedFileURL
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), isDirectory.boolValue else {
      return nil
    }
    return url.path
  }

  private func writeWorkspacePreference(_ root: String) {
    let file = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".anneal/workspace.json")
    try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    let payload = ["workspaceRoot": root]
    guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]) else { return }
    try? data.write(to: file)
  }

  // MARK: - Server

  private func startServer(_ helper: URL, workspace: String, port: UInt16) throws {
    let process = Process()
    process.executableURL = helper
    process.arguments = ["--workspace", workspace]

    var environment = ProcessInfo.processInfo.environment
    environment["ANNEAL_NO_OPEN"] = "1"
    environment["ANNEAL_NO_PROMPT"] = "1"
    environment["ANNEAL_PORT"] = String(port)
    process.environment = environment

    let pipe = Pipe()
    process.standardOutput = pipe
    process.standardError = pipe
    pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
      let data = handle.availableData
      if !data.isEmpty {
        try? self?.logFile?.write(contentsOf: data)
      }
    }

    process.terminationHandler = { [weak self] process in
      DispatchQueue.main.async {
        guard let self, !self.terminating else { return }
        Self.alert(
          "Anneal server stopped",
          "The local server exited with status \(process.terminationStatus). Details are in ~/Library/Logs/Anneal IDE/server.log.",
        )
        NSApp.terminate(nil)
      }
    }

    try process.run()
    serverPID = pid_t(process.processIdentifier)
    self.server = process
    self.logPipe = pipe
    self.logFile = Self.openLog()
  }

  private static func openLog() -> FileHandle? {
    let directory = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("Logs/Anneal IDE")
    try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = directory.appendingPathComponent("server.log")
    if !FileManager.default.fileExists(atPath: file.path) {
      FileManager.default.createFile(atPath: file.path, contents: nil)
    }
    guard let handle = FileHandle(forWritingAtPath: file.path) else { return nil }
    handle.seekToEndOfFile()
    try? handle.write(contentsOf: Data("\n--- Anneal IDE launched ---\n".utf8))
    return handle
  }

  private static func waitForServer(_ url: URL, timeout: TimeInterval = 30) -> Bool {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      let semaphore = DispatchSemaphore(value: 0)
      var succeeded = false
      var request = URLRequest(url: url)
      request.timeoutInterval = 1
      let task = URLSession.shared.dataTask(with: request) { _, response, _ in
        if let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) {
          succeeded = true
        }
        semaphore.signal()
      }
      task.resume()
      _ = semaphore.wait(timeout: .now() + 1.2)
      if succeeded { return true }
      Thread.sleep(forTimeInterval: 0.25)
    }
    return false
  }

  private func freePort() -> UInt16 {
    let descriptor = Darwin.socket(AF_INET, Int32(SOCK_STREAM), Int32(IPPROTO_TCP))
    guard descriptor >= 0 else { return 8787 }

    var address = sockaddr_in()
    address.sin_family = sa_family_t(AF_INET)
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    address.sin_port = 0

    let bound = withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        Darwin.bind(descriptor, socketAddress, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    guard bound == 0 else {
      Darwin.close(descriptor)
      return 8787
    }

    var resolved = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &resolved) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        Darwin.getsockname(descriptor, socketAddress, &length)
      }
    }
    Darwin.close(descriptor)
    return UInt16(bigEndian: resolved.sin_port)
  }

  // MARK: - Window

  private func presentWindow() {
    let configuration = WKWebViewConfiguration()
    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false,
    )
    window.title = "Anneal IDE"
    window.minSize = NSSize(width: 1024, height: 700)
    window.center()
    window.contentView = webView
    window.makeKeyAndOrderFront(nil)

    self.window = window
    self.webView = webView
    webView.loadHTMLString(Self.loadingHTML, baseURL: nil)
  }

  private func installMenu() {
    let mainMenu = NSMenu()
    let appItem = NSMenuItem()
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About Anneal IDE", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Quit Anneal IDE", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appItem.submenu = appMenu
    mainMenu.addItem(appItem)
    NSApp.mainMenu = mainMenu
  }

  private static func alert(_ title: String, _ message: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.alertStyle = .warning
    alert.runModal()
  }

  private static let loadingHTML = """
  <!doctype html><html><head><meta charset="utf-8"><title>Anneal IDE</title>
  <style>
    html,body{height:100%;margin:0;background:#0a0d14;color:#c7d0e0;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    main{height:100%;display:grid;place-content:center;text-align:center;gap:12px}
    .dot{width:14px;height:14px;margin:0 auto;border-radius:50%;background:#b18cff;box-shadow:0 0 24px #b18cff;animation:pulse 1.2s infinite ease-in-out}
    @keyframes pulse{50%{opacity:.35;transform:scale(.75)}}
  </style></head><body><main><div class="dot"></div><strong>Starting Anneal IDE…</strong>
  <span>Loading your workspace</span></main></body></html>
  """

  private static let errorHTML = """
  <!doctype html><html><head><meta charset="utf-8"><title>Anneal IDE</title>
  <style>
    html,body{height:100%;margin:0;background:#0a0d14;color:#f0a4a4;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    main{height:100%;display:grid;place-content:center;text-align:center;gap:10px}
  </style></head><body><main><strong>The local server did not start.</strong>
  <span>See ~/Library/Logs/Anneal IDE/server.log for details.</span></main></body></html>
  """
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.activate(ignoringOtherApps: true)
application.run()
