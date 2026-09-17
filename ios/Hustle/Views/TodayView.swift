import SwiftUI

struct TodayView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var dashboard: DashboardStore
    @EnvironmentObject var focus: FocusStore
    @Binding var showLockMode: Bool
    @State private var showVault = false
    @AppStorage("hustle.dailyWord") private var dailyWord = ""
    @State private var editingWord = false

    var body: some View {
        ZStack {
            Theme.ground
            ScrollView {
                VStack(spacing: 14) {
                    header
                    dailyWordBanner
                    statGrid
                    vaultStrip
                    if focus.engine.current != nil { focusingStrip }
                    Spacer(minLength: 80)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .refreshable { await dashboard.refresh() }
        }
        .sheet(isPresented: $showVault) { VaultSheet() }
        .sheet(isPresented: $editingWord) { DailyWordEditor(text: $dailyWord) }
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Hustle")
                    .font(.system(size: 34, weight: .bold, design: .serif))
                    .tracking(-0.5)
                Text(Date().formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                    .font(.system(size: 11, weight: .semibold)).tracking(1.4)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Button {
                if !session.isAuthed { session.showUnlock = true }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: session.isAuthed ? "lock.open" : "lock")
                    Text(session.isAuthed ? "Unlocked" : "Locked")
                }
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(session.isAuthed ? Theme.emerald : Theme.muted)
                .padding(.horizontal, 12).frame(height: 34)
                .background(.white, in: Capsule())
                .overlay(Capsule().stroke(Theme.hairline))
            }
        }
    }

    private var dailyWordBanner: some View {
        Button { if session.isAuthed { editingWord = true } else { session.showUnlock = true } } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "quote.opening")
                    .font(.system(size: 13)).foregroundStyle(Theme.faint)
                    .frame(width: 32, height: 32)
                    .background(.white, in: Circle()).overlay(Circle().stroke(Theme.hairline))
                VStack(alignment: .leading, spacing: 4) {
                    Theme.label("Daily Word")
                    Text(dailyWord.isEmpty ? "Tap to write today's line." : dailyWord)
                        .font(.system(size: 16, design: .serif))
                        .foregroundStyle(dailyWord.isEmpty ? Theme.faint : Color(hex: 0x3F3F46))
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
            }
            .padding(14)
            .background(Color.white.opacity(0.7), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline))
        }
        .buttonStyle(.plain)
    }

    private var statGrid: some View {
        let balance = dashboard.cumulativePushupBalance
        let today = dashboard.today
        let tokens = dashboard.todayTokens
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
            StatCard(icon: balance > 0 ? "exclamationmark.triangle" : "waveform.path.ecg",
                     tint: balance > 0 ? Theme.rose : Theme.emerald,
                     title: balance > 0 ? "Smoking Debt" : "Workout Surplus",
                     value: String(abs(balance)),
                     caption: balance > 0 ? "pushups owed" : (balance == 0 ? "balanced" : "extra pushups"),
                     footLeft: ("Smoke", String(today?.cigarettes ?? 0)),
                     footRight: ("Workout", String(today?.exercises ?? 0)))
            StatCard(icon: "timer", tint: Theme.violet, title: "Focus Time",
                     value: Format.hours(today?.focusMinutesTotal ?? 0), caption: "today",
                     footLeft: ("Wk", Format.hours(dashboard.focusWeekAvg)),
                     footRight: ("Mo", Format.hours(dashboard.focusMonthAvg)))
            StatCard(icon: "checkmark.circle", tint: Theme.emerald, title: "Tasks Done",
                     value: String(today?.tasksCompletedTotal ?? 0),
                     caption: "today · \(focus.engine.tasks.count) open",
                     footLeft: ("Wk", String(dashboard.tasksWeekTotal)),
                     footRight: ("Mo", String(dashboard.tasksMonthTotal)))
            StatCard(icon: "sparkles", tint: Theme.pink, title: "AI Tokens",
                     value: Format.tokens(tokens.claude + tokens.codex),
                     caption: "Claude \(Format.tokens(tokens.claude)) · Codex \(Format.tokens(tokens.codex))",
                     footLeft: ("Wk", Format.tokens(dashboard.tokensWeekAvg)),
                     footRight: ("Mo", Format.tokens(dashboard.tokensMonthAvg)))
        }
    }

    private var vaultStrip: some View {
        let v = dashboard.vault
        return Button { showVault = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "gift")
                    .font(.system(size: 17)).foregroundStyle(Color(hex: 0xFBBF24))
                    .frame(width: 36, height: 36)
                    .background(Color(hex: 0x27272A), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Theme.label("Vault")
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("¥\(v.balance)").font(.system(size: 20, weight: .semibold)).monospacedDigit()
                        Text("next +¥\(Vault.productivityReward) in \(v.nextTasks - v.totalTasks) tasks")
                            .font(.system(size: 11)).foregroundStyle(Theme.faint)
                    }
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 14)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 16))
            .shadow(color: Theme.ink.opacity(0.3), radius: 14, y: 10)
        }
        .buttonStyle(.plain)
    }

    private var focusingStrip: some View {
        Button { showLockMode = true } label: {
            HStack(spacing: 12) {
                Circle().fill(focus.engine.current?.status == .running ? Theme.violet : Theme.faint).frame(width: 8, height: 8)
                Text("\(focus.engine.current?.status == .running ? "Focusing" : "Paused") · \(focus.engine.selected?.title ?? "No task")")
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(Color(hex: 0x3F3F46))
                    .lineLimit(1)
                Spacer()
                Text(Int(focus.engine.current?.remainingMs ?? 0).clockString)
                    .font(.system(size: 13, weight: .semibold)).monospacedDigit()
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Theme.cardFill, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairline))
        }
        .buttonStyle(.plain)
    }
}

struct StatCard: View {
    var icon: String
    var tint: Color
    var title: String
    var value: String
    var caption: String
    var footLeft: (String, String)
    var footRight: (String, String)

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(tint)
                    .frame(width: 26, height: 26)
                    .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(tint.opacity(0.25)))
                Theme.label(title, color: Theme.muted)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 34, weight: .light)).tracking(-0.7).monospacedDigit()
                Text(caption).font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.faint).lineLimit(1)
            }
            Divider().overlay(Theme.hairlineSoft)
            HStack {
                Text("\(footLeft.0) ").foregroundStyle(Theme.muted) + Text(footLeft.1).fontWeight(.semibold)
                Spacer()
                Text("\(footRight.0) ").foregroundStyle(Theme.muted) + Text(footRight.1).fontWeight(.semibold)
            }
            .font(.system(size: 11)).monospacedDigit()
        }
        .card()
    }
}

struct DailyWordEditor: View {
    @Binding var text: String
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            TextEditor(text: $draft)
                .font(.system(size: 18, design: .serif))
                .padding(16)
                .navigationTitle("Daily Word")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Save") { text = String(draft.prefix(500)); dismiss() }.fontWeight(.semibold)
                    }
                }
        }
        .onAppear { draft = text }
    }
}
