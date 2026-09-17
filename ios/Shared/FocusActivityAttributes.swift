import ActivityKit
import Foundation

/// The data the Live Activity (lock screen + Dynamic Island) renders.
/// Shared between the app (which starts/updates it) and the widget extension (which draws it).
struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Wall-clock instant the pomodoro will hit 00:00 if it keeps running. `nil` while paused.
        var endsAt: Date?
        /// Remaining ms frozen at pause time, so the paused view can show a static clock.
        var pausedRemainingMs: Int
        var taskTitle: String
        var listKey: String?
        /// Time on the current task within this pomodoro, in ms.
        var onTaskMs: Int
        var upNext: [String]
        var pomodoroIndex: Int
    }

    /// Fixed for the life of one pomodoro.
    var roundId: String
    var durationMs: Int
}
