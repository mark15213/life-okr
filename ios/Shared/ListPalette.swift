import SwiftUI

/// The same four (plus inbox) colours the web dashboard uses for TickTick lists.
/// Keep in sync with lib/ticktick/lists.ts.
enum ListPalette {
    static func color(for key: String?) -> Color {
        switch key {
        case "work": return Color(hex: 0x7C3AED)
        case "study": return Color(hex: 0x0891B2)
        case "hustle": return Color(hex: 0xD97706)
        case "life": return Color(hex: 0xE11D48)
        default: return Color(hex: 0x64748B)
        }
    }

    static func label(for key: String?) -> String {
        switch key {
        case "work": return "Work"
        case "study": return "Study"
        case "hustle": return "Hustle"
        case "life": return "Life"
        case "inbox": return "Inbox"
        default: return "—"
        }
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

extension Int {
    /// "mm:ss" for a millisecond count, rounded up so a fresh pomodoro reads as its full length.
    var clockString: String {
        let total = Swift.max(0, Int((Double(self) / 1000).rounded(.up)))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    /// "m:ss" without leading zero — for per-task totals ("6:20 on this task").
    var shortClockString: String {
        let total = Swift.max(0, self / 1000)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
