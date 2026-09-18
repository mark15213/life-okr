import Foundation

/// A task as the queue holds it. Order in the array *is* priority; index 0 is "Working on".
struct QueuedTask: Identifiable, Hashable, Codable {
    var id: String
    var title: String
    var list: String?
    var dueLabel: String?
    var group: String?
}

/// One pomodoro. Elapsed time is the sum of its segments; the clock never resets on a switch.
struct Round: Codable, Hashable {
    enum Status: String, Codable { case running, paused }

    var id: String
    var durationMs: Double
    var elapsedMs: Double = 0
    var status: Status = .running
    var startedAt: Double
    var segments: [FocusSegment] = []
    /// Index into `segments` of the one still accruing time, if any.
    var openSegment: Int? = nil

    var remainingMs: Double { max(0, durationMs - elapsedMs) }
    var isComplete: Bool { elapsedMs >= durationMs }

    /// Milliseconds spent per task in this round.
    func totals() -> [String: Double] {
        var map: [String: Double] = [:]
        for s in segments { map[s.taskId ?? "", default: 0] += s.durationMs }
        return map
    }
}

/// The pomodoro/queue state machine. A straight port of desktop/engine.mjs so all clients
/// agree on what a switch, a pause and a completion mean.
///
/// Pure value semantics: the store owns an instance, mutates it, and publishes. Time comes
/// in through `now` (epoch ms) so tests can drive it.
struct FocusEngine {
    var tasks: [QueuedTask] = []
    var selectedId: String?
    var current: Round?
    var recent: [String] = []
    var durationMs: Double = 30 * 60_000

    private var anchor: Double?

    // MARK: Read

    var selected: QueuedTask? { tasks.first { $0.id == selectedId } }

    /// "Up next": the queue rotated to start just after the selected task, wrapping past the
    /// end back to the front. Rotating rather than filtering is what lets repeated swipes walk
    /// the whole queue — taking the top row minus the selection would bounce between the first
    /// two tasks forever and never reach the third.
    func queue(limit: Int = 3) -> [QueuedTask] {
        guard tasks.count > 1 else { return selectedId == nil ? Array(tasks.prefix(limit)) : [] }
        guard let idx = tasks.firstIndex(where: { $0.id == selectedId }) else {
            return Array(tasks.prefix(limit))
        }
        let rotated = Array(tasks[(idx + 1)...]) + Array(tasks[..<idx])
        return Array(rotated.prefix(limit))
    }

    /// The task before the selected one in queue order (for swipe-down), wrapping from the
    /// front back to the end so swipe-down is the exact inverse of swipe-up.
    var previousInQueue: QueuedTask? {
        guard tasks.count > 1, let idx = tasks.firstIndex(where: { $0.id == selectedId }) else { return nil }
        return tasks[(idx - 1 + tasks.count) % tasks.count]
    }

    // MARK: Time

    /// Accrue running time since the last tick into the open segment. Returns the round if it just completed.
    @discardableResult
    mutating func tick(now: Double) -> Round? {
        defer { anchor = now }
        guard var round = current, round.status == .running, let anchor else { return nil }
        let delta = min(max(0, now - anchor), round.durationMs - round.elapsedMs)
        if delta > 0 {
            // An empty queue still runs the clock; the time is filed under no task.
            let task = selected
            if let open = round.openSegment, round.segments[open].taskId == task?.id {
                round.segments[open].durationMs += delta
            } else {
                round.segments.append(FocusSegment(
                    id: FocusEngine.hexId(), taskId: task?.id, title: task?.title ?? "", list: task?.list,
                    startedAt: now - delta, durationMs: delta))
                round.openSegment = round.segments.count - 1
            }
            round.elapsedMs += delta
        }
        current = round
        if round.isComplete {
            return end(reason: .completed, now: now)
        }
        return nil
    }

    private mutating func closeSegment() {
        current?.openSegment = nil
    }

    // MARK: Switching

    mutating func select(_ id: String, now: Double) {
        tick(now: now)
        guard tasks.contains(where: { $0.id == id }), id != selectedId else { return }
        closeSegment()
        selectedId = id
        recent = [id] + recent.filter { $0 != id }
        if recent.count > 100 { recent.removeLast(recent.count - 100) }
    }

    mutating func next(now: Double) {
        if let task = queue(limit: 1).first { select(task.id, now: now) }
    }

    /// Swipe-down: the task above the current one in the queue, else the most recent other task.
    mutating func previous(now: Double) {
        if let above = previousInQueue { select(above.id, now: now); return }
        if let id = recent.first(where: { rid in rid != selectedId && tasks.contains { $0.id == rid } }) {
            select(id, now: now)
        }
    }

    mutating func move(fromOffsets: IndexSet, toOffset: Int) {
        tasks.move(fromOffsets: fromOffsets, toOffset: toOffset)
    }

    // MARK: Round lifecycle

    mutating func start(now: Double) {
        guard current == nil else { return }
        current = Round(id: FocusEngine.hexId(), durationMs: durationMs, startedAt: now)
        anchor = now
    }

    mutating func pause(now: Double) {
        tick(now: now)
        current?.status = .paused
        closeSegment()
    }

    mutating func resume(now: Double) {
        if current == nil { start(now: now); return }
        current?.status = .running
        anchor = now
    }

    mutating func toggle(now: Double) {
        if current?.status == .running { pause(now: now) } else { resume(now: now) }
    }

    enum EndReason { case completed, ended }

    /// Close the round and hand it back for upload. `nil` when nothing was running.
    @discardableResult
    mutating func end(reason: EndReason, now: Double) -> Round? {
        guard var round = current else { return nil }
        round.openSegment = nil
        current = nil
        return round
    }

    /// Completing the selected task hands the round to the next queued one; the clock keeps running.
    @discardableResult
    mutating func complete(_ id: String, now: Double) -> QueuedTask? {
        tick(now: now)
        guard let task = tasks.first(where: { $0.id == id }) else { return nil }
        let wasCurrent = id == selectedId
        let following = wasCurrent ? queue(limit: 1).first : nil
        if wasCurrent { closeSegment() }
        tasks.removeAll { $0.id == id }
        recent.removeAll { $0 == id }
        if wasCurrent {
            selectedId = nil
            if let following { select(following.id, now: now) }
            else { current?.status = .paused }
        }
        return task
    }

    // MARK: Sync

    /// Merge a fresh TickTick list: known tasks keep their slot (with fresh title/list), new
    /// ones join at the front, vanished ones drop out. Returns true if the selected task vanished.
    @discardableResult
    mutating func syncTasks(_ incoming: [PanelTask], now: Double) -> Bool {
        tick(now: now)
        let fresh = Dictionary(incoming.map { ($0.id, QueuedTask(id: $0.id, title: $0.title, list: $0.list, dueLabel: $0.dueLabel, group: $0.group)) },
                               uniquingKeysWith: { a, _ in a })
        let removed = selectedId.map { fresh[$0] == nil } ?? false
        if removed { pause(now: now) }
        var known: [QueuedTask] = []
        var seen = Set<String>()
        for t in tasks {
            if let f = fresh[t.id] { known.append(f); seen.insert(t.id) }
        }
        // A task is captured because it is the next thing to do, so anything the queue has not
        // seen before heads it rather than sinking to the bottom of a long list.
        var added: [QueuedTask] = []
        for t in incoming where !seen.contains(t.id) {
            added.append(fresh[t.id]!)
            seen.insert(t.id)
        }
        tasks = added + known
        if removed { selectedId = nil }
        return removed
    }

    /// Apply the server-side priority order. Ids the order has never seen keep their relative
    /// order but sort ahead of everything it knows — same rule as `applyQueueOrder` on the web.
    mutating func applyOrder(_ order: [String]) {
        let rank = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
        let count = tasks.count
        tasks = tasks.enumerated().sorted { a, b in
            let ra = rank[a.element.id] ?? (a.offset - count)
            let rb = rank[b.element.id] ?? (b.offset - count)
            return ra < rb
        }.map(\.element)
    }

    // MARK: Server shape

    func toSession(now: Double, device: String) -> FocusSession? {
        guard let round = current else { return nil }
        return FocusSession(
            id: round.id, durationMs: round.durationMs, status: round.status == .running ? .running : .paused,
            startedAt: round.startedAt, elapsedMs: round.elapsedMs, asOf: now,
            selectedTaskId: selectedId, segments: round.segments, device: device)
    }

    /// Adopt a session another device is running. Time since `asOf` is credited to the
    /// selected task so the countdown lines up with the other screen.
    mutating func adopt(_ s: FocusSession, now: Double) {
        var round = Round(id: s.id, durationMs: s.durationMs, elapsedMs: s.elapsedMs,
                          status: s.status == .running ? .running : .paused,
                          startedAt: s.startedAt, segments: s.segments)
        round.openSegment = nil
        selectedId = s.selectedTaskId ?? selectedId
        durationMs = s.durationMs
        current = round
        anchor = s.status == .running ? s.asOf : now
        tick(now: now)
    }

    /// 24 hex characters — the id shape TickTick accepts for focus sessions.
    static func hexId() -> String {
        (0..<12).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
    }
}
