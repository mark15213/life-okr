import Foundation

/// Thin wrapper over the dashboard's existing Next.js routes.
///
/// Auth is the same signed cookie the browser uses: `POST /api/auth/unlock` sets it and
/// `URLSession`'s shared cookie storage keeps it for 30 days. Nothing here is new server
/// surface except `/api/state/*`, which the iOS build introduced.
final class APIClient {
    static let shared = APIClient()

    static let defaultBaseURL = URL(string: "https://hustle-beta-i.vercel.app")!
    private static let baseURLKey = "hustle.baseURL"

    var baseURL: URL {
        get {
            if let raw = UserDefaults.standard.string(forKey: Self.baseURLKey), let url = URL(string: raw) {
                return url
            }
            return Self.defaultBaseURL
        }
        set { UserDefaults.standard.set(newValue.absoluteString, forKey: Self.baseURLKey) }
    }

    private let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.httpCookieAcceptPolicy = .always
        config.httpShouldSetCookies = true
        config.timeoutIntervalForRequest = 20
        return URLSession(configuration: config)
    }()

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    enum HTTPError: LocalizedError {
        case status(Int, String)
        case unauthorized
        case conflict(Data)

        var errorDescription: String? {
            switch self {
            case .status(let code, let message): return "\(code): \(message)"
            case .unauthorized: return "Unlock first"
            case .conflict: return "Changed on another device"
            }
        }
    }

    // MARK: Core

    private func request<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [String: String] = [:],
        body: Encodable? = nil,
        as type: T.Type
    ) async throws -> T {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        switch status {
        case 200..<300:
            return try decoder.decode(T.self, from: data)
        case 401:
            throw HTTPError.unauthorized
        case 409:
            throw HTTPError.conflict(data)
        default:
            let message = (try? decoder.decode(APIError.self, from: data))?.error ?? "Request failed"
            throw HTTPError.status(status, message)
        }
    }

    // MARK: Auth

    func sessionIsValid() async -> Bool {
        (try? await request("GET", "/api/auth/session", as: AuthResponse.self))?.authenticated ?? false
    }

    func unlock(code: String) async throws {
        _ = try await request("POST", "/api/auth/unlock", body: ["code": code], as: AuthResponse.self)
    }

    // MARK: Records

    func today() async throws -> TodayResponse {
        try await request("GET", "/api/records/today", as: TodayResponse.self)
    }

    func records(days: Int) async throws -> [DailyRecord] {
        try await request("GET", "/api/records", query: ["days": String(days)], as: RecordsResponse.self).records
    }

    func records(since: String) async throws -> [DailyRecord] {
        try await request("GET", "/api/records", query: ["since": since], as: RecordsResponse.self).records
    }

    func logCigarette() async throws -> DailyRecord {
        try await request("POST", "/api/records/cigarette", as: RecordResponse.self).record
    }

    func logExercise(calories: Int) async throws -> DailyRecord {
        try await request("POST", "/api/records/exercise", body: ["calories": calories], as: RecordResponse.self).record
    }

    func backfill(date: String, exercises: Int, focus: Int, tasks: Int) async throws {
        struct Body: Encodable { var date: String; var exercises: Int; var focus: Int; var tasks: Int }
        struct Reply: Decodable {}
        _ = try await request("POST", "/api/records/backfill",
                              body: Body(date: date, exercises: exercises, focus: focus, tasks: tasks), as: Reply.self)
    }

    func categories(days: Int) async throws -> [CategoryStatRow] {
        try await request("GET", "/api/records/categories", query: ["days": String(days)], as: CategoriesResponse.self).entries
    }

    func tokens(days: Int) async throws -> [TokenUsageRow] {
        try await request("GET", "/api/tokens", query: ["days": String(days)], as: TokensResponse.self).entries
    }

    // MARK: Tasks (TickTick, via the dashboard)

    func tasks() async throws -> [PanelTask] {
        try await request("GET", "/api/ticktick/tasks", as: TasksResponse.self).tasks
    }

    func createTask(title: String, list: String) async throws -> PanelTask {
        try await request("POST", "/api/ticktick/tasks", body: ["title": title, "list": list], as: TaskResponse.self).task
    }

    func completeTask(id: String) async throws {
        struct Reply: Decodable {}
        _ = try await request("POST", "/api/ticktick/tasks/\(id)/complete", as: Reply.self)
    }

    func wontDoTask(id: String) async throws {
        struct Reply: Decodable {}
        _ = try await request("POST", "/api/ticktick/tasks/\(id)/wont-do", as: Reply.self)
    }

    /// Upload one finished focus segment as a TickTick pomodoro. Idempotent on `sessionId`.
    func uploadFocus(sessionId: String, taskId: String, title: String, startedAt: Double, endedAt: Double) async throws {
        struct Body: Encodable {
            var sessionId: String; var taskId: String; var title: String
            var startedAt: Double; var endedAt: Double; var pausedSeconds: Int
        }
        struct Reply: Decodable { var focusSeconds: Int }
        _ = try await request("POST", "/api/ticktick/focus",
                              body: Body(sessionId: sessionId, taskId: taskId, title: title,
                                         startedAt: startedAt, endedAt: endedAt, pausedSeconds: 0),
                              as: Reply.self)
    }

    /// Recompute the dashboard's stored daily totals from TickTick.
    ///
    /// `/api/ticktick/focus` only writes the session into TickTick; the numbers the cards
    /// read come off the dashboard's own rows, and those are only rebuilt here. The web
    /// panel and the desktop client both call this straight after an upload — without it a
    /// pomodoro finished on the phone sits invisible until some other machine syncs.
    ///
    /// Safe to call repeatedly: the endpoint recomputes and overwrites rather than adding.
    func resyncDashboard() async throws {
        struct Reply: Decodable {}
        _ = try await request("POST", "/api/ticktick/sync", as: Reply.self)
    }

    // MARK: Vault

    func vaultPurchases() async throws -> [VaultPurchase] {
        try await request("GET", "/api/vault", as: VaultResponse.self).purchases
    }

    func spend(item: String, cost: Int) async throws {
        struct Body: Encodable { var item_name: String; var cost: Int }
        struct Reply: Decodable {}
        _ = try await request("POST", "/api/vault", body: Body(item_name: item, cost: cost), as: Reply.self)
    }

    // MARK: Shared state

    func readState<T: Codable>(_ key: String, as type: T.Type) async throws -> StoredState<T> {
        try await request("GET", "/api/state/\(key)", as: StoredState<T>.self)
    }

    private struct StateBody<V: Encodable>: Encodable {
        var value: V?
        var ifVersion: Int?

        enum CodingKeys: String, CodingKey { case value, ifVersion }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            // An explicit null clears the session; an omitted value is rejected by the API.
            try container.encode(value, forKey: .value)
            try container.encodeIfPresent(ifVersion, forKey: .ifVersion)
        }
    }

    /// Returns nil on a version conflict (someone else wrote first) so the caller can re-read.
    func writeState<T: Codable>(_ key: String, value: T?, ifVersion: Int?) async throws -> StoredState<T>? {
        do {
            return try await request("PUT", "/api/state/\(key)", body: StateBody(value: value, ifVersion: ifVersion), as: StoredState<T>.self)
        } catch HTTPError.conflict {
            return nil
        }
    }
}

/// Lets `request` take any `Encodable` body without generics leaking into every call site.
private struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFn = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
