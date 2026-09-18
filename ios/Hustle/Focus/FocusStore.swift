import Foundation
import SwiftUI
import UIKit

/// Owns the engine, keeps it in step with the server, and turns finished rounds into
/// TickTick pomodoro uploads. One instance for the whole app.
@MainActor
final class FocusStore: ObservableObject {
    @Published private(set) var engine = FocusEngine()
    @Published var loadingTasks = false
    @Published var error: String?
    /// The round that just finished, for the "Done" moment in Lock mode.
    @Published var justCompleted: Round?
    /// A manual sync is in flight (the button in the Focus header).
    @Published private(set) var syncing = false
    /// When the last manual or automatic full sync finished, for the header's "synced 2m ago".
    @Published private(set) var lastSyncedAt: Date?

    private let api = APIClient.shared
    private var ticker: Timer?
    private var orderVersion = 0
    private var sessionVersion = 0
    private var saveSessionTask: Task<Void, Never>?
    private var saveOrderTask: Task<Void, Never>?
    private var lastSavedSessionSignature = ""
    /// True between a local reorder and its write landing — while it is, a pulled order is
    /// older than what is on screen and must not be applied over it.
    private var orderSavePending = false
    private let activity = FocusActivityManager()

    private static let pendingKey = "hustle.pendingFocusUploads"
    private static let localTasksKey = "hustle.queueSnapshot"
    private var device: String { UIDevice.current.name }

    private var now: Double { Date().timeIntervalSince1970 * 1000 }

    init() {
        restoreSnapshot()
        // .common mode so the clock keeps repainting while the queue is being scrolled or dragged.
        let timer = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    // MARK: Ticking

    private func tick() {
        guard engine.current != nil else { return }
        if let done = engine.tick(now: now) {
            roundFinished(done)
        }
        activity.update(from: engine)
    }

    // MARK: Queue

    func loadTasks() async {
        loadingTasks = true
        defer { loadingTasks = false }
        do {
            let tasks = try await api.tasks()
            engine.syncTasks(tasks, now: now)
            let stored = try await api.readState("queue-order", as: QueueOrder.self)
            orderVersion = stored.version
            if let order = stored.value?.order, !orderSavePending { engine.applyOrder(order) }
            if engine.selectedId == nil, let first = engine.tasks.first { engine.selectedId = first.id }
            saveSnapshot()
            error = nil
            // Counts for the header's "synced Xm ago" whether it was the button or the
            // automatic pull on launch that got here.
            lastSyncedAt = Date()
        } catch APIClient.HTTPError.unauthorized {
            // Reads of the task list are gated too; the view shows the unlock prompt.
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Reorder the rows the Focus screen is currently showing.
    ///
    /// Under a tag or Today filter those rows are a subset of the queue, so the new relative
    /// order is written back into the slots that subset already occupies and everything else
    /// keeps its place. Dragging the third Work task above the first therefore moves it above
    /// that task in the full queue too, without disturbing the Study tasks in between.
    func move(visibleIds: [String], fromOffsets: IndexSet, toOffset: Int) {
        var reordered = visibleIds
        reordered.move(fromOffsets: fromOffsets, toOffset: toOffset)

        let affected = Set(visibleIds)
        let byId = Dictionary(engine.tasks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var filled = reordered.makeIterator()
        engine.tasks = engine.tasks.map { task in
            guard affected.contains(task.id), let id = filled.next(), let moved = byId[id] else { return task }
            return moved
        }

        // Dragging something to the top makes it the task being worked on.
        if let first = engine.tasks.first, first.id != engine.selectedId {
            engine.select(first.id, now: now)
        }
        saveSnapshot()
        scheduleSaveOrder()
    }

    /// Adopt a priority order set elsewhere — normally the web dashboard's All tab, which
    /// writes the same `queue-order` key. Cheap enough to call on every foreground: the
    /// version has not moved unless someone actually reordered.
    func pullOrder() async {
        guard !orderSavePending else { return }
        do {
            let stored = try await api.readState("queue-order", as: QueueOrder.self)
            guard stored.version != orderVersion else { return }
            orderVersion = stored.version
            guard let order = stored.value?.order else { return }
            engine.applyOrder(order)
            saveSnapshot()
        } catch {
            // Silent: a failed poll must not reshuffle a queue that is being worked down.
        }
    }

    /// Everything the Focus header's sync button does: the task list and the shared order, the
    /// pomodoro another device may be running, and any focus record that failed to upload.
    func syncNow() async {
        guard !syncing else { return }
        syncing = true
        defer { syncing = false }
        await loadTasks()
        await pullSession()
        await flushUploads()
        if error == nil { lastSyncedAt = Date() }
    }

    private func scheduleSaveOrder() {
        orderSavePending = true
        saveOrderTask?.cancel()
        saveOrderTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(600))
            guard let self, !Task.isCancelled else { return }
            await self.saveOrder()
        }
    }

    private func saveOrder() async {
        defer { orderSavePending = false }
        let order = QueueOrder(order: engine.tasks.map(\.id))
        do {
            let written = try await api.writeState("queue-order", value: order, ifVersion: orderVersion)
            if let written {
                orderVersion = written.version
            } else {
                // Someone else reordered first. Take theirs, then re-apply ours on top once.
                let theirs = try await api.readState("queue-order", as: QueueOrder.self)
                orderVersion = theirs.version
                let retried = try await api.writeState("queue-order", value: order, ifVersion: orderVersion)
                if let retried { orderVersion = retried.version }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func addTask(title: String, list: String) async {
        do {
            let task = try await api.createTask(title: title, list: list)
            engine.tasks.append(QueuedTask(id: task.id, title: task.title, list: task.list, dueLabel: task.dueLabel, group: task.group))
            if engine.selectedId == nil { engine.selectedId = task.id }
            saveSnapshot()
            scheduleSaveOrder()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func complete(_ id: String) async {
        guard engine.complete(id, now: now) != nil else { return }
        saveSnapshot()
        scheduleSaveSession()
        scheduleSaveOrder()
        do { try await api.completeTask(id: id) } catch { self.error = error.localizedDescription }
    }

    func wontDo(_ id: String) async {
        guard engine.complete(id, now: now) != nil else { return }
        saveSnapshot()
        scheduleSaveSession()
        do { try await api.wontDoTask(id: id) } catch { self.error = error.localizedDescription }
    }

    // MARK: Switching

    func select(_ id: String) {
        engine.select(id, now: now)
        afterSwitch()
    }

    func next() { engine.next(now: now); afterSwitch() }
    func previous() { engine.previous(now: now); afterSwitch() }

    private func afterSwitch() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        scheduleSaveSession()
        activity.update(from: engine)
    }

    // MARK: Round

    func start() {
        engine.start(now: now)
        activity.start(from: engine)
        scheduleSaveSession(immediate: true)
    }

    func toggle() {
        if engine.current == nil { start(); return }
        engine.toggle(now: now)
        activity.update(from: engine)
        scheduleSaveSession(immediate: true)
    }

    /// End early. Segments still upload; the daily total only counts full rounds server-side.
    func finish() {
        engine.tick(now: now)
        if let round = engine.end(reason: .ended, now: now) { roundFinished(round) }
    }

    private func roundFinished(_ round: Round) {
        justCompleted = round
        activity.end()
        enqueueUploads(for: round)
        Task { await flushUploads() }
        scheduleSaveSession(immediate: true)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    // MARK: Session sync (server)

    private func scheduleSaveSession(immediate: Bool = false) {
        saveSessionTask?.cancel()
        saveSessionTask = Task { [weak self] in
            if !immediate { try? await Task.sleep(for: .seconds(2)) }
            guard let self, !Task.isCancelled else { return }
            await self.saveSession()
        }
    }

    private func saveSession() async {
        let session = engine.toSession(now: now, device: device)
        let signature = "\(session?.id ?? "nil")|\(session?.status.rawValue ?? "")|\(session?.selectedTaskId ?? "")|\(session?.segments.count ?? 0)"
        if signature == lastSavedSessionSignature && session?.status != .running { return }
        do {
            let written = try await api.writeState("focus-session", value: session, ifVersion: sessionVersion)
            if let written {
                sessionVersion = written.version
                lastSavedSessionSignature = signature
            } else {
                await pullSession()
            }
        } catch APIClient.HTTPError.unauthorized {
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Adopt whatever another device is running. Called on foreground and every 20s while visible.
    func pullSession() async {
        do {
            let stored = try await api.readState("focus-session", as: FocusSession.self)
            guard stored.version != sessionVersion else { return }
            sessionVersion = stored.version
            if let remote = stored.value {
                if engine.current?.id != remote.id || remote.device != device {
                    engine.adopt(remote, now: now)
                    activity.start(from: engine)
                }
            } else if engine.current != nil, engine.current?.status == .paused {
                // Another device ended it; nothing running anywhere now.
                _ = engine.end(reason: .ended, now: now)
                activity.end()
            }
        } catch {
            // Silent: a poll failing must not disturb a running timer.
        }
    }

    // MARK: Uploads (each segment → one TickTick pomodoro)

    private struct PendingUpload: Codable {
        var sessionId: String; var taskId: String; var title: String; var startedAt: Double; var endedAt: Double
    }

    private func enqueueUploads(for round: Round) {
        var pending = loadPending()
        for s in round.segments {
            guard let taskId = s.taskId, s.durationMs >= 60_000 else { continue }
            pending.append(PendingUpload(sessionId: s.id, taskId: taskId, title: s.title,
                                         startedAt: s.startedAt, endedAt: s.startedAt + s.durationMs))
        }
        savePending(pending)
    }

    func flushUploads() async {
        var pending = loadPending()
        guard !pending.isEmpty else { return }
        var remaining: [PendingUpload] = []
        for item in pending {
            do {
                try await api.uploadFocus(sessionId: item.sessionId, taskId: item.taskId, title: item.title,
                                          startedAt: item.startedAt, endedAt: item.endedAt)
            } catch {
                remaining.append(item)
            }
        }
        pending = remaining
        savePending(pending)
    }

    private func loadPending() -> [PendingUpload] {
        guard let data = UserDefaults.standard.data(forKey: Self.pendingKey) else { return [] }
        return (try? JSONDecoder().decode([PendingUpload].self, from: data)) ?? []
    }

    private func savePending(_ items: [PendingUpload]) {
        UserDefaults.standard.set(try? JSONEncoder().encode(items), forKey: Self.pendingKey)
    }

    // MARK: Local snapshot (so the queue shows instantly on launch)

    private func saveSnapshot() {
        UserDefaults.standard.set(try? JSONEncoder().encode(engine.tasks), forKey: Self.localTasksKey)
    }

    private func restoreSnapshot() {
        guard let data = UserDefaults.standard.data(forKey: Self.localTasksKey),
              let tasks = try? JSONDecoder().decode([QueuedTask].self, from: data) else { return }
        engine.tasks = tasks
        engine.selectedId = tasks.first?.id
    }
}
