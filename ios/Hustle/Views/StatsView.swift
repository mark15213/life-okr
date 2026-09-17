import Charts
import SwiftUI

/// Week/month trend for one metric, with the change against the previous period, then the
/// category split. A cut-down version of the web Analytics page.
struct StatsView: View {
    @EnvironmentObject var dashboard: DashboardStore

    enum Metric: String, CaseIterable, Identifiable {
        case focus = "Focus", tasks = "Tasks", workout = "Workout", tokens = "Tokens"
        var id: String { rawValue }
        var tint: Color {
            switch self {
            case .focus: return Theme.violet
            case .tasks: return Theme.emerald
            case .workout: return Theme.rose
            case .tokens: return Theme.pink
            }
        }
    }

    enum Period: String, CaseIterable { case week = "Week", month = "Month" }

    @State private var metric: Metric = .focus
    @State private var period: Period = .week
    @State private var categories: [CategoryStatRow] = []

    var body: some View {
        ZStack {
            Theme.ground
            ScrollView {
                VStack(spacing: 14) {
                    header
                    metricChips
                    trendCard
                    categoryCard
                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 20).padding(.top, 8)
            }
        }
        .task { categories = (try? await APIClient.shared.categories(days: 30)) ?? [] }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Stats").font(.system(size: 28, weight: .bold, design: .serif)).tracking(-0.5)
                Theme.label(period == .week ? "Last 8 weeks" : "Last 6 months", color: Theme.muted)
            }
            Spacer()
            HStack(spacing: 2) {
                ForEach(Period.allCases, id: \.self) { p in
                    Button { period = p } label: {
                        Text(p.rawValue).font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(period == p ? .white : Theme.muted)
                            .padding(.horizontal, 12).frame(height: 26)
                            .background(period == p ? Theme.ink : .clear, in: Capsule())
                    }
                }
            }
            .padding(3).background(.white, in: Capsule()).overlay(Capsule().stroke(Theme.hairline))
        }
    }

    private var metricChips: some View {
        HStack(spacing: 8) {
            ForEach(Metric.allCases) { m in
                Button { metric = m } label: {
                    HStack(spacing: 6) {
                        Circle().fill(m.tint).frame(width: 8, height: 8)
                        Text(m.rawValue)
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(metric == m ? m.tint : Color(hex: 0x52525B))
                    .padding(.horizontal, 12).frame(height: 34)
                    .background(metric == m ? m.tint.opacity(0.1) : .white, in: Capsule())
                    .overlay(Capsule().stroke(metric == m ? m.tint : Theme.hairline))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Data shaping

    private struct Bucket: Identifiable {
        var id: String; var label: String; var value: Double
    }

    /// Value of the selected metric on one day.
    private func value(_ r: DailyRecord) -> Double {
        switch metric {
        case .focus: return Double(r.focusMinutesTotal) / 60
        case .tasks: return Double(r.tasksCompletedTotal)
        case .workout: return Double(r.exercises)
        case .tokens:
            let t = dashboard.tokensByDate[r.date] ?? (0, 0)
            return Double(t.claude + t.codex) / 1_000_000
        }
    }

    private var buckets: [Bucket] {
        let cal = Calendar(identifier: .iso8601)
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        var sums: [String: Double] = [:]
        var labels: [String: String] = [:]
        for r in dashboard.records {
            guard let d = f.date(from: r.date) else { continue }
            let key: String, label: String
            if period == .week {
                let wk = cal.component(.weekOfYear, from: d), yr = cal.component(.yearForWeekOfYear, from: d)
                key = String(format: "%04d-%02d", yr, wk); label = "W\(wk)"
            } else {
                let mo = cal.component(.month, from: d), yr = cal.component(.year, from: d)
                key = String(format: "%04d-%02d", yr, mo); label = d.formatted(.dateTime.month(.abbreviated))
            }
            sums[key, default: 0] += value(r); labels[key] = label
        }
        let count = period == .week ? 8 : 6
        return sums.keys.sorted().suffix(count).map { Bucket(id: $0, label: labels[$0] ?? $0, value: sums[$0] ?? 0) }
    }

    private var unit: String {
        switch metric {
        case .focus: return "hrs"
        case .tasks: return "tasks"
        case .workout: return "workouts"
        case .tokens: return "M tokens"
        }
    }

    private func fmt(_ v: Double) -> String {
        switch metric {
        case .focus: return String(format: "%d:%02d", Int(v), Int((v - Double(Int(v))) * 60))
        case .tokens: return String(format: "%.1f", v)
        default: return String(Int(v.rounded()))
        }
    }

    // MARK: Cards

    private var trendCard: some View {
        let b = buckets
        let current = b.last?.value ?? 0
        let previous = b.count >= 2 ? b[b.count - 2].value : 0
        let pct: String = previous == 0 ? (current == 0 ? "—" : "+∞") : String(format: "%@%d%%", current >= previous ? "+" : "", Int(((current - previous) / previous * 100).rounded()))
        let up = current >= previous
        let best = b.max(by: { $0.value < $1.value })

        return VStack(alignment: .leading, spacing: 18) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    Theme.label("\(metric.rawValue) · this \(period == .week ? "week" : "month")")
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(fmt(current)).font(.system(size: 40, weight: .light)).tracking(-1.2).monospacedDigit()
                        Text(unit).font(.system(size: 12)).foregroundStyle(Theme.faint)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    HStack(spacing: 4) {
                        Image(systemName: up ? "arrow.up" : "arrow.down").font(.system(size: 10, weight: .bold))
                        Text(pct)
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(up ? Color(hex: 0x047857) : Color(hex: 0xBE123C))
                    .padding(.horizontal, 8).frame(height: 24)
                    .background(up ? Color(hex: 0xECFDF5) : Color(hex: 0xFFF1F2), in: Capsule())
                    Text("vs last \(fmt(previous))").font(.system(size: 11)).foregroundStyle(Theme.faint).monospacedDigit()
                }
            }

            Chart(b) { bucket in
                BarMark(x: .value("Period", bucket.label), y: .value(metric.rawValue, bucket.value))
                    .foregroundStyle(bucket.id == b.last?.id ? metric.tint
                                     : bucket.id == best?.id ? metric.tint.opacity(0.55) : metric.tint.opacity(0.28))
                    .cornerRadius(5)
                    .annotation(position: .top) {
                        if bucket.id == best?.id, b.count > 1 {
                            Text("best \(fmt(bucket.value))").font(.system(size: 9, weight: .semibold)).foregroundStyle(metric.tint)
                        }
                    }
            }
            .chartYAxis { AxisMarks(position: .leading, values: .automatic(desiredCount: 3)) { _ in AxisGridLine().foregroundStyle(Theme.hairlineSoft) } }
            .chartXAxis { AxisMarks { _ in AxisValueLabel().font(.system(size: 9, weight: .semibold)).foregroundStyle(Theme.faint) } }
            .frame(height: 160)
        }
        .card(padding: 18)
    }

    private var categoryCard: some View {
        let days = period == .week ? 7 : 30
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "Asia/Shanghai")
        let cutoff = f.string(from: Calendar.current.date(byAdding: .day, value: -(days - 1), to: Date()) ?? Date())
        let rows = categories.filter { $0.date >= cutoff }
        var byCat: [String: Int] = [:]
        for r in rows { byCat[r.category, default: 0] += metric == .focus ? r.focus_minutes : r.tasks_completed }
        let total = byCat.values.reduce(0, +)
        let ordered = byCat.filter { $0.value > 0 }.sorted { $0.value > $1.value }

        return VStack(alignment: .leading, spacing: 14) {
            HStack {
                Theme.label("By category · this \(period == .week ? "week" : "month")")
                Spacer()
                Text(metric == .focus ? Format.hours(total) : "\(total) tasks").font(.system(size: 11)).foregroundStyle(Theme.muted)
            }
            if ordered.isEmpty {
                Text("No category data yet").font(.system(size: 13)).foregroundStyle(Theme.faint)
            }
            ForEach(ordered, id: \.key) { pair in
                let cat = pair.key, v = pair.value
                VStack(spacing: 6) {
                    HStack {
                        Text(ListPalette.label(for: cat == "uncategorized" ? "inbox" : cat)).font(.system(size: 12, weight: .medium))
                        Spacer()
                        Text("\(metric == .focus ? Format.hours(v) : String(v)) · \(total == 0 ? 0 : v * 100 / total)%")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted).monospacedDigit()
                    }
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.hairlineSoft)
                            Capsule().fill(ListPalette.color(for: cat)).frame(width: total == 0 ? 0 : geo.size.width * CGFloat(v) / CGFloat(total))
                        }
                    }.frame(height: 6)
                }
            }
        }
        .card(padding: 18)
    }
}
