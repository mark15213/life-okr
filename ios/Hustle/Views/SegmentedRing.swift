import SwiftUI

/// The pomodoro ring: one arc per segment, coloured by the task's list, then the remaining
/// time in a neutral track. The 30 minutes are one circle; switching tasks only changes colour.
struct SegmentedRing: View {
    var round: Round?
    var lineWidth: CGFloat = 8
    var track: Color = Theme.hairlineSoft
    var showHead = false

    private struct Arc: Identifiable {
        var id: String; var from: Double; var to: Double; var color: Color
    }

    private var arcs: [Arc] {
        guard let round else { return [] }
        var start = 0.0
        return round.segments.map { seg in
            let arc = Arc(id: seg.id, from: start / round.durationMs,
                          to: min(1, (start + seg.durationMs) / round.durationMs),
                          color: ListPalette.color(for: seg.list))
            start += seg.durationMs
            return arc
        }
    }

    var body: some View {
        ZStack {
            Circle().stroke(track, lineWidth: lineWidth)
            ForEach(arcs) { arc in
                Circle()
                    .trim(from: arc.from, to: arc.to)
                    .stroke(arc.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
            }
            if showHead, let round, round.elapsedMs > 0 {
                let head = round.elapsedMs / round.durationMs
                Circle()
                    .trim(from: max(0, head - 0.002), to: head)
                    .stroke(.white, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            }
        }
        .rotationEffect(.degrees(-90))
    }
}

/// A row of dots + "Review PR 5:16" for the time split of the current round.
struct RoundLegend: View {
    var round: Round?
    var tasks: [QueuedTask]
    var textColor: Color = Theme.muted

    private var rows: [(id: String, title: String, list: String?, ms: Double)] {
        guard let round else { return [] }
        var order: [String] = []
        var acc: [String: (title: String, list: String?, ms: Double)] = [:]
        for s in round.segments {
            let key = s.taskId ?? ""
            if acc[key] == nil { order.append(key); acc[key] = (s.title.isEmpty ? "No task" : s.title, s.list, 0) }
            acc[key]!.ms += s.durationMs
        }
        return order.map { (id: $0, title: acc[$0]!.title, list: acc[$0]!.list, ms: acc[$0]!.ms) }
    }

    var body: some View {
        FlowLayout(spacing: 12) {
            ForEach(rows, id: \.id) { r in
                HStack(spacing: 5) {
                    Circle().fill(ListPalette.color(for: r.list)).frame(width: 6, height: 6)
                    Text(r.title).lineLimit(1)
                    Text(Int(r.ms).shortClockString).monospacedDigit()
                }
                .font(.system(size: 11)).foregroundStyle(textColor)
            }
        }
    }
}

/// Minimal wrapping HStack.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + 6; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + 6; rowHeight = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
