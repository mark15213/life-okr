import ActivityKit
import SwiftUI
import WidgetKit

/// The pomodoro on the real iOS lock screen and in the Dynamic Island.
/// The countdown is drawn by the system from `endsAt`, so it stays live without updates.
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            LockScreenCard(context: context)
                .activityBackgroundTint(Color(hex: 0x09090B))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label {
                        Text(context.state.taskTitle).lineLimit(1).font(.system(size: 13, weight: .semibold))
                    } icon: {
                        Circle().fill(ListPalette.color(for: context.state.listKey)).frame(width: 8, height: 8)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state)
                        .font(.system(size: 20, weight: .light)).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let next = context.state.upNext.first {
                        HStack(spacing: 6) {
                            Text("UP NEXT").font(.system(size: 9, weight: .semibold)).tracking(1.2).foregroundStyle(.secondary)
                            Text(next).font(.system(size: 12)).lineLimit(1).foregroundStyle(.secondary)
                        }
                    }
                }
            } compactLeading: {
                Circle().fill(ListPalette.color(for: context.state.listKey)).frame(width: 10, height: 10).padding(.leading, 4)
            } compactTrailing: {
                Countdown(state: context.state)
                    .font(.system(size: 13, weight: .medium)).monospacedDigit().frame(width: 44)
            } minimal: {
                Countdown(state: context.state, minimal: true)
                    .font(.system(size: 11, weight: .medium)).monospacedDigit()
            }
        }
    }
}

/// Live countdown while running, a frozen "mm:ss" while paused.
struct Countdown: View {
    var state: FocusActivityAttributes.ContentState
    var minimal = false

    var body: some View {
        if let endsAt = state.endsAt {
            Text(timerInterval: Date.now...max(Date.now, endsAt), countsDown: true, showsHours: false)
                .multilineTextAlignment(.trailing)
        } else {
            Text(minimal ? "⏸" : state.pausedRemainingMs.clockString)
        }
    }
}

struct LockScreenCard: View {
    let context: ActivityViewContext<FocusActivityAttributes>

    var body: some View {
        let s = context.state
        HStack(spacing: 14) {
            ZStack {
                Circle().stroke(Color(hex: 0x27272A), lineWidth: 5)
                if let endsAt = s.endsAt {
                    ProgressView(timerInterval: endsAt.addingTimeInterval(-Double(context.attributes.durationMs) / 1000)...endsAt,
                                 countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .progressViewStyle(.circular)
                        .tint(ListPalette.color(for: s.listKey))
                } else {
                    Circle()
                        .trim(from: 0, to: 1 - Double(s.pausedRemainingMs) / Double(max(1, context.attributes.durationMs)))
                        .stroke(ListPalette.color(for: s.listKey), style: StrokeStyle(lineWidth: 5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
            }
            .frame(width: 52, height: 52)

            VStack(alignment: .leading, spacing: 4) {
                Text(s.endsAt == nil ? "PAUSED" : "WORKING ON")
                    .font(.system(size: 9, weight: .semibold)).tracking(1.4)
                    .foregroundStyle(ListPalette.color(for: s.listKey))
                Text(s.taskTitle).font(.system(size: 16, weight: .semibold)).lineLimit(1).foregroundStyle(.white)
                HStack(spacing: 6) {
                    Text(ListPalette.label(for: s.listKey))
                    Text("·")
                    Text("\(s.onTaskMs.shortClockString) on this task")
                    if let next = s.upNext.first {
                        Text("·")
                        Text("next: \(next)").lineLimit(1)
                    }
                }
                .font(.system(size: 11)).foregroundStyle(Color(hex: 0xA1A1AA)).monospacedDigit()
            }
            Spacer(minLength: 4)
            Countdown(state: s)
                .font(.system(size: 30, weight: .light)).tracking(-1).monospacedDigit().foregroundStyle(.white)
                .frame(minWidth: 84, alignment: .trailing)
        }
        .padding(16)
    }
}
