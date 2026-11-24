import AppKit
import Foundation

guard CommandLine.arguments.count >= 2 else {
  FileHandle.standardError.write(Data("usage: make-icon <iconset-directory>\n".utf8))
  exit(1)
}

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try? FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

func render(_ size: Int, _ name: String) throws {
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: size,
    pixelsHigh: size,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else { return }

  bitmap.size = NSSize(width: size, height: size)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)

  let bounds = NSRect(x: 0, y: 0, width: size, height: size)
  NSColor.clear.setFill()
  bounds.fill()

  let inset = CGFloat(size) * 0.06
  let shape = NSBezierPath(
    roundedRect: bounds.insetBy(dx: inset, dy: inset),
    xRadius: CGFloat(size) * 0.22,
    yRadius: CGFloat(size) * 0.22,
  )
  let gradient = NSGradient(colors: [
    NSColor(calibratedRed: 0.36, green: 0.24, blue: 0.72, alpha: 1),
    NSColor(calibratedRed: 0.10, green: 0.68, blue: 0.66, alpha: 1),
  ])
  gradient?.draw(in: shape, angle: 270)

  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont.boldSystemFont(ofSize: CGFloat(size) * 0.52),
    .foregroundColor: NSColor(calibratedWhite: 1, alpha: 0.96),
    .paragraphStyle: paragraph,
  ]
  NSAttributedString(string: "A", attributes: attributes).draw(
    in: NSRect(x: 0, y: CGFloat(size) * 0.29, width: CGFloat(size), height: CGFloat(size) * 0.46)
  )

  NSGraphicsContext.restoreGraphicsState()
  guard let png = bitmap.representation(using: .png, properties: [:]) else { return }
  try png.write(to: output.appendingPathComponent(name))
}

let entries: [(Int, String)] = [
  (16, "icon_16x16.png"),
  (32, "icon_16x16@2x.png"),
  (32, "icon_32x32.png"),
  (64, "icon_32x32@2x.png"),
  (128, "icon_128x128.png"),
  (256, "icon_128x128@2x.png"),
  (256, "icon_256x256.png"),
  (512, "icon_256x256@2x.png"),
  (512, "icon_512x512.png"),
  (1024, "icon_512x512@2x.png"),
]

for (size, name) in entries {
  try render(size, name)
}
