import Foundation

/// One row of `daily_records`. Field names match the JSON the Next.js routes return.
struct DailyRecord: Codable, Identifiable, Hashable {
    var id: Int
    var date: String
    var cigarettes: Int
    var exercises: Int
    var pushup_balance: Int
    var focus_minutes: Int
    var tasks_completed: Int
    var calories_burned: Int
    var focus_minutes_ticktick: Int?
    var tasks_completed_ticktick: Int?

    /// Manual + TickTick, the way the dashboard displays it.
    var focusMinutesTotal: Int { focus_minutes + (focus_minutes_ticktick ?? 0) }
    var tasksCompletedTotal: Int { tasks_completed + (tasks_completed_ticktick ?? 0) }
}

struct TodayResponse: Codable {
    var record: DailyRecord
    var cumulativePushupBalance: Int
}

struct RecordsResponse: Codable {
    var records: [DailyRecord]
}

struct RecordResponse: Codable {
    var record: DailyRecord
}

struct TokenUsageRow: Codable, Hashable {
    var date: String
    var tool: String
    var total_tokens: Int
}

struct TokensResponse: Codable {
    var entries: [TokenUsageRow]
}

/// What `/api/ticktick/tasks` hands every client. Grouping is resolved server-side.
struct PanelTask: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var projectId: String?
    var list: String?
    var priority: Int
    var group: String
    var dueLabel: String?
    var dueAt: Double?
}

struct TasksResponse: Codable {
    var tasks: [PanelTask]
}

struct TaskResponse: Codable {
    var task: PanelTask
}

struct VaultPurchase: Codable, Identifiable, Hashable {
    var id: Int
    var item_name: String
    var cost: Int
    var created_at: String
}

struct VaultResponse: Codable {
    var purchases: [VaultPurchase]
}

struct CategoryStatRow: Codable, Hashable {
    var date: String
    var category: String
    var focus_minutes: Int
    var tasks_completed: Int
}

struct CategoriesResponse: Codable {
    var entries: [CategoryStatRow]
}

struct AuthResponse: Codable {
    var authenticated: Bool
}

// MARK: - Shared state (lib/app-state.ts)

struct QueueOrder: Codable, Hashable {
    var order: [String]
}

struct FocusSegment: Codable, Hashable, Identifiable {
    var id: String
    var taskId: String?
    var title: String
    var list: String?
    var startedAt: Double
    var durationMs: Double
}

/// The one pomodoro that may be running, as every client stores it on the server.
struct FocusSession: Codable, Hashable {
    enum Status: String, Codable { case running, paused }

    var id: String
    var durationMs: Double
    var status: Status
    var startedAt: Double
    var elapsedMs: Double
    var asOf: Double
    var selectedTaskId: String?
    var segments: [FocusSegment]
    var device: String
}

struct StoredState<T: Codable>: Codable {
    var value: T?
    var version: Int
    var updatedAt: Double?
}

struct APIError: Codable, Error, LocalizedError {
    var error: String
    var errorDescription: String? { error }
}
