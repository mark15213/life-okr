import ActivityKit
import Foundation

/// Starts, updates and ends the lock-screen Live Activity for the running pomodoro.
/// Updates are throttled: ActivityKit rate-limits, and the countdown itself is rendered by
/// the system from `endsAt`, so only task switches, pauses and completions need a push.
final class FocusActivityManager {
    private var activity: Activity<FocusActivityAttributes>?
    private var lastState: FocusActivityAttributes.ContentState?

    func start(from engine: FocusEngine) {
        guard ActivityAuthorizationInfo().areActivitiesEnabled, let round = engine.current else { return }
        if let activity, activity.attributes.roundId == round.id {
            update(from: engine)
            return
        }
        end()
        let attributes = FocusActivityAttributes(roundId: round.id, durationMs: Int(round.durationMs))
        let state = Self.state(from: engine)
        do {
            activity = try Activity.request(attributes: attributes,
                                            content: .init(state: state, staleDate: nil),
                                            pushType: nil)
            lastState = state
        } catch {
            activity = nil
        }
    }

    func update(from engine: FocusEngine) {
        guard let activity, engine.current != nil else { return }
        let state = Self.state(from: engine)
        // The system counts down from endsAt by itself; only re-send when something else changed.
        if let last = lastState,
           last.taskTitle == state.taskTitle, last.upNext == state.upNext,
           (last.endsAt == nil) == (state.endsAt == nil),
           abs((last.endsAt?.timeIntervalSince1970 ?? 0) - (state.endsAt?.timeIntervalSince1970 ?? 0)) < 2 {
            return
        }
        lastState = state
        Task { await activity.update(.init(state: state, staleDate: nil)) }
    }

    func end() {
        guard let activity else { return }
        let final = lastState
        self.activity = nil
        lastState = nil
        Task {
            if let final {
                await activity.end(.init(state: final, staleDate: nil), dismissalPolicy: .after(.now + 60))
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    private static func state(from engine: FocusEngine) -> FocusActivityAttributes.ContentState {
        let round = engine.current
        let remaining = Int(round?.remainingMs ?? 0)
        let running = round?.status == .running
        let selected = engine.selected
        let onTask = Int(round?.totals()[selected?.id ?? ""] ?? 0)
        return .init(
            endsAt: running ? Date().addingTimeInterval(Double(remaining) / 1000) : nil,
            pausedRemainingMs: remaining,
            taskTitle: selected?.title ?? "No task selected",
            listKey: selected?.list,
            onTaskMs: onTask,
            upNext: engine.queue(limit: 2).map(\.title),
            pomodoroIndex: 1
        )
    }
}
