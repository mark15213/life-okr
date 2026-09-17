import Foundation
import SwiftUI

/// Today's numbers, the history the cards and charts need, tokens and the vault.
/// Mirrors the data the web dashboard's home page fetches.
@MainActor
final class DashboardStore: ObservableObject {
    @Published var today: DailyRecord?
    @Published var cumulativePushupBalance = 0
    @Published var records: [DailyRecord] = []          // last 365 days, newest first
    @Published var vaultRecords: [DailyRecord] = []     // since the vault epoch
    @Published var tokens: [TokenUsageRow] = []
    @Published var purchases: [VaultPurchase] = []
    @Published var loading = false
    @Published var error: String?

    private let api = APIClient.shared

    func refresh() async {
        loading = today == nil
        defer { loading = false }
        do {
            async let t = api.today()
            async let r = api.records(days: 365)
            async let v = api.records(since: Vault.epoch)
            async let k = api.tokens(days: 30)
            async let p = api.vaultPurchases()
            let (todayResp, recs, vault, toks, purch) = try await (t, r, v, k, p)
            today = todayResp.record
            cumulativePushupBalance = todayResp.cumulativePushupBalance
            records = recs
            vaultRecords = vault
            tokens = toks
            purchases = purch
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: Writes (optimistic, then re-fetch)

    func logCigarette() async throws {
        today?.cigarettes += 1
        cumulativePushupBalance += 100
        _ = try await api.logCigarette()
        await refresh()
    }

    func logExercise(calories: Int) async throws {
        today?.exercises += 1
        cumulativePushupBalance -= 100
        _ = try await api.logExercise(calories: calories)
        await refresh()
    }

    func spend(item: String, cost: Int) async throws {
        try await api.spend(item: item, cost: cost)
        await refresh()
    }

    // MARK: Derived numbers

    private func average(_ field: (DailyRecord) -> Int, days: Int) -> Int {
        let slice = records.prefix(days)
        guard !slice.isEmpty else { return 0 }
        return Int((Double(slice.map(field).reduce(0, +)) / Double(slice.count)).rounded())
    }

    private func total(_ field: (DailyRecord) -> Int, days: Int) -> Int {
        records.prefix(days).map(field).reduce(0, +)
    }

    var focusWeekAvg: Int { average(\.focusMinutesTotal, days: 7) }
    var focusMonthAvg: Int { average(\.focusMinutesTotal, days: 30) }
    var tasksWeekTotal: Int { total(\.tasksCompletedTotal, days: 7) }
    var tasksMonthTotal: Int { total(\.tasksCompletedTotal, days: 30) }

    /// Tokens by date → (claude, codex).
    var tokensByDate: [String: (claude: Int, codex: Int)] {
        var map: [String: (claude: Int, codex: Int)] = [:]
        for e in tokens {
            var cur = map[e.date] ?? (0, 0)
            if e.tool == "claude_code" { cur.claude = e.total_tokens } else { cur.codex = e.total_tokens }
            map[e.date] = cur
        }
        return map
    }

    var todayKey: String {
        let f = DateFormatter()
        f.timeZone = TimeZone(identifier: "Asia/Shanghai")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    var todayTokens: (claude: Int, codex: Int) { tokensByDate[todayKey] ?? (0, 0) }

    private var dailyTokenTotals: [Int] {
        tokensByDate.sorted { $0.key > $1.key }.map { $0.value.claude + $0.value.codex }
    }
    var tokensWeekAvg: Int {
        let s = dailyTokenTotals.prefix(7); return s.isEmpty ? 0 : s.reduce(0, +) / s.count
    }
    var tokensMonthAvg: Int {
        let s = dailyTokenTotals.prefix(30); return s.isEmpty ? 0 : s.reduce(0, +) / s.count
    }

    var vault: Vault.Summary {
        Vault.summary(records: vaultRecords + (today.map { [$0] } ?? []),
                      cumulativePushupBalance: cumulativePushupBalance,
                      purchases: purchases)
    }
}

/// Port of lib/vault.ts. Rates and epochs must stay identical to the web version.
enum Vault {
    static let epoch = "2026-08-19"
    static let legacyEarned = 5100
    static let reward = 100
    static let productivityRateEpoch = "2026-09-16"
    static let productivityReward = 200
    static let tasksPerReward = 5
    static let focusMinutesPerReward = 180
    static let exercisesPerReward = 2

    struct Summary {
        var balance: Int
        var totalEarned: Int
        var totalSpent: Int
        var totalTasks: Int
        var totalFocusMinutes: Int
        var qualifyingExercises: Int

        var nextTasks: Int { (totalTasks / tasksPerReward + 1) * tasksPerReward }
        var nextFocus: Int { (totalFocusMinutes / focusMinutesPerReward + 1) * focusMinutesPerReward }
        var nextExercises: Int { (qualifyingExercises / exercisesPerReward + 1) * exercisesPerReward }
    }

    static func summary(records: [DailyRecord], cumulativePushupBalance: Int, purchases: [VaultPurchase]) -> Summary {
        var byDate: [String: DailyRecord] = [:]
        for r in records where r.date >= epoch { byDate[r.date] = r }
        let era = byDate.values.sorted { $0.date < $1.date }

        var balance = era.reduce(cumulativePushupBalance) { $0 - $1.pushup_balance }
        var qualifyingExercises = 0, totalTasks = 0, totalFocus = 0, taskReward = 0, focusReward = 0

        for r in era {
            balance += r.pushup_balance
            if balance <= 0 && r.cigarettes == 0 { qualifyingExercises += r.exercises }
            let rate = r.date >= productivityRateEpoch ? productivityReward : reward
            let tasks = r.tasksCompletedTotal, focus = r.focusMinutesTotal
            taskReward += ((totalTasks + tasks) / tasksPerReward - totalTasks / tasksPerReward) * rate
            focusReward += ((totalFocus + focus) / focusMinutesPerReward - totalFocus / focusMinutesPerReward) * rate
            totalTasks += tasks
            totalFocus += focus
        }
        let exerciseReward = qualifyingExercises / exercisesPerReward * reward
        let earned = legacyEarned + exerciseReward + taskReward + focusReward
        let spent = purchases.map(\.cost).reduce(0, +)
        return Summary(balance: earned - spent, totalEarned: earned, totalSpent: spent,
                       totalTasks: totalTasks, totalFocusMinutes: totalFocus, qualifyingExercises: qualifyingExercises)
    }
}

enum Format {
    static func tokens(_ n: Int) -> String {
        if n <= 0 { return "—" }
        if n >= 1_000_000_000 { return String(format: "%.1fB", Double(n) / 1e9) }
        if n >= 1_000_000 { return String(format: "%.1fM", Double(n) / 1e6) }
        if n >= 1_000 { return String(format: "%.1fk", Double(n) / 1e3) }
        return String(n)
    }

    /// "h:mm" for a minute count, as the web Focus card shows it.
    static func hours(_ minutes: Int) -> String {
        String(format: "%d:%02d", minutes / 60, minutes % 60)
    }
}
