import SwiftUI

/// One priority-ordered queue. Index 0 is "Working on". Drag rows to reorder; the top row
/// becomes the task being worked on. The clock is one 30-minute pomodoro shared by all rows.
struct FocusView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var focus: FocusStore
    @Binding var showLockMode: Bool
    @State private var newTitle = ""
    @State private var newList = "work"
    @State private var queueFilter: QueueFilter = .all
    @FocusState private var composing: Bool

    private var round: Round? { focus.engine.current }

    var body: some View {
        ZStack {
            Theme.ground
            VStack(spacing: 0) {
                header.padding(.horizontal, 20).padding(.top, 8)
                workingOnStrip.padding(.horizontal, 20).padding(.top, 18)
                if round != nil {
                    RoundLegend(round: round, tasks: focus.engine.tasks)
                        .padding(.horizontal, 26).padding(.top, 8)
                }
                queueHeader.padding(.horizontal, 20).padding(.top, 16)
                queueList
                composer.padding(.horizontal, 20).padding(.vertical, 10)
            }
        }
        .task { if session.isAuthed, focus.engine.tasks.isEmpty { await focus.loadTasks() } }
    }

    // MARK: Header

    /// "8 in queue · synced 2m ago" — the sync half matters because the order can be set on
    /// the dashboard, and a stale queue looks exactly like a correct one.
    private var statusLine: String {
        var parts: [String] = []
        if let round { parts.append("Pomodoro · \(Int(round.remainingMs).clockString) left") }
        parts.append("\(focus.engine.tasks.count) in queue")
        parts.append(syncLabel)
        return parts.joined(separator: " · ")
    }

    private var syncLabel: String {
        if focus.syncing { return "Syncing…" }
        guard let at = focus.lastSyncedAt else { return "Not synced yet" }
        let seconds = Int(Date().timeIntervalSince(at))
        if seconds < 60 { return "Synced just now" }
        if seconds < 3600 { return "Synced \(seconds / 60)m ago" }
        return "Synced \(seconds / 3600)h ago"
    }

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Focus").font(.system(size: 28, weight: .bold, design: .serif)).tracking(-0.5)
                Theme.label(statusLine, color: Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            Spacer(minLength: 8)

            // A spinner rather than a spun icon: the button is disabled while it runs, and a
            // rotating glyph on a disabled control reads as decoration.
            Button {
                Task { await focus.syncNow() }
            } label: {
                Group {
                    if focus.syncing {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.ink)
                    }
                }
                .frame(width: 34, height: 34)
                .background(.white, in: Circle())
                .overlay(Circle().stroke(Theme.hairline))
            }
            .accessibilityLabel("Sync now")
            .disabled(focus.syncing || !session.isAuthed)

            Button {
                if round == nil { focus.start() }
                showLockMode = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "iphone")
                    Text("Lock mode")
                }
                .font(.system(size: 12, weight: .semibold)).foregroundStyle(.white)
                .padding(.horizontal, 12).frame(height: 34)
                .background(Theme.ink, in: Capsule())
            }
            .disabled(focus.engine.tasks.isEmpty && round == nil)
        }
    }

    // MARK: Working on

    private var workingOnStrip: some View {
        HStack(spacing: 14) {
            ZStack {
                SegmentedRing(round: round, lineWidth: 6, track: Color(hex: 0xEDE9FE))
                Text(Int(round?.remainingMs ?? focus.engine.durationMs).clockString)
                    .font(.system(size: 17, weight: .medium)).tracking(-0.3).monospacedDigit()
            }
            .frame(width: 74, height: 74)

            VStack(alignment: .leading, spacing: 5) {
                Theme.label(round == nil ? "Ready" : (round?.status == .running ? "Working on" : "Paused"),
                            color: round?.status == .running ? Theme.violet : Theme.faint)
                Text(focus.engine.selected?.title ?? "Pick a task below")
                    .font(.system(size: 16, weight: .semibold)).lineLimit(1)
                HStack(spacing: 6) {
                    if let sel = focus.engine.selected {
                        ListChip(key: sel.list)
                        Text("\(Int(round?.totals()[sel.id] ?? 0).shortClockString) in this pomodoro")
                            .font(.system(size: 11)).foregroundStyle(Theme.muted).monospacedDigit()
                    }
                }
            }
            Spacer(minLength: 0)

            VStack(spacing: 8) {
                Button { focus.toggle() } label: {
                    Image(systemName: round?.status == .running ? "pause.fill" : "play.fill")
                        .font(.system(size: 14)).foregroundStyle(.white)
                        .frame(width: 40, height: 40).background(Theme.ink, in: Circle())
                }
                .accessibilityLabel(round?.status == .running ? "Pause" : "Start")
                .disabled(focus.engine.selected == nil && round == nil)
                Button {
                    if let id = focus.engine.selectedId { Task { await focus.complete(id) } }
                } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Color(hex: 0x059669))
                        .frame(width: 40, height: 40)
                        .background(Color(hex: 0xECFDF5), in: Circle())
                        .overlay(Circle().stroke(Color(hex: 0xA7F3D0)))
                }
                .accessibilityLabel("Mark done")
                .disabled(focus.engine.selected == nil)
            }
        }
        .padding(16)
        .background(
            LinearGradient(colors: [Color(hex: 0xFAF5FF), .white], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 20))
        .overlay(RoundedRectangle(cornerRadius: 20).stroke(Color(hex: 0xDDD6FE)))
        .shadow(color: Theme.violet.opacity(0.08), radius: 15, y: 10)
    }

    // MARK: Queue

    private func tasks(for filter: QueueFilter) -> [QueuedTask] {
        switch filter {
        case .all: return focus.engine.tasks
        case .today: return focus.engine.tasks.filter { $0.group == "today" || $0.group == "overdue" }
        case .list(let key): return focus.engine.tasks.filter { $0.list == key }
        }
    }

    private var visibleTasks: [QueuedTask] { tasks(for: queueFilter) }

    private var queueHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Theme.label("Queue · drag to reorder")
                Spacer()
                if queueFilter != .all {
                    Theme.label("\(visibleTasks.count) shown", color: Theme.faint)
                }
            }

            // One scrolling row rather than two stacked ones: All/Today and the four lists are
            // the same question — which slice of the queue am I looking at — and two rows of
            // pills that can both be "on" invite the reading that they combine.
            // The explicit height is load-bearing: a horizontal ScrollView is still flexible
            // vertically, so in this column it would grow into the queue below it.
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(QueueFilter.options, id: \.self) { filter in
                        filterPill(filter)
                    }
                }
            }
            .frame(height: 28)
        }
    }

    private func filterPill(_ filter: QueueFilter) -> some View {
        let on = filter == queueFilter
        // The tag pills carry their list colour so the row matches the chips on the cards; the
        // two time filters stay black, which is what tells the two kinds apart at a glance.
        let tint = filter.tint ?? Theme.ink
        let count = tasks(for: filter).count

        return Button { queueFilter = filter } label: {
            HStack(spacing: 5) {
                if let colour = filter.tint {
                    Circle().fill(on ? Color.white.opacity(0.85) : colour).frame(width: 5, height: 5)
                }
                Text(filter.title)
                Text("\(count)").monospacedDigit().opacity(0.6)
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(on ? .white : Theme.muted)
            .padding(.horizontal, 10).frame(height: 26)
            .background(on ? tint : .white, in: Capsule())
            .overlay(Capsule().stroke(on ? .clear : Theme.hairline))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(filter.title), \(count) tasks")
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    private var queueList: some View {
        List {
            ForEach(Array(visibleTasks.enumerated()), id: \.element.id) { index, task in
                QueueRow(task: task, position: focus.engine.tasks.firstIndex(of: task).map { $0 + 1 } ?? index + 1,
                         isSelected: task.id == focus.engine.selectedId,
                         running: round?.status == .running,
                         inRoundMs: Int(round?.totals()[task.id] ?? 0))
                    .listRowInsets(EdgeInsets(top: 3, leading: 20, bottom: 3, trailing: 20))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                    .contentShape(Rectangle())
                    .onTapGesture { focus.select(task.id) }
                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                        Button { Task { await focus.complete(task.id) } } label: { Label("Done", systemImage: "checkmark") }
                            .tint(Theme.emerald)
                        Button { Task { await focus.wontDo(task.id) } } label: { Label("Won't do", systemImage: "xmark") }
                            .tint(Theme.faint)
                    }
            }
            .onMove { from, to in
                focus.move(visibleIds: visibleTasks.map(\.id), fromOffsets: from, toOffset: to)
            }
            if focus.loadingTasks && focus.engine.tasks.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear).listRowSeparator(.hidden)
            } else if visibleTasks.isEmpty {
                Text(session.isAuthed
                     ? (focus.engine.tasks.isEmpty ? "Queue is empty — add a task below." : "Nothing under \(queueFilter.title).")
                     : "Unlock to load your tasks.")
                    .font(.system(size: 13)).foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity).padding(.top, 20)
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.editMode, .constant(.active))   // always show drag handles
        .refreshable { await focus.syncNow() }
    }

    // MARK: Composer

    private var composer: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Menu {
                    ForEach(["work", "study", "hustle", "life"], id: \.self) { key in
                        Button(ListPalette.label(for: key)) { newList = key }
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(ListPalette.label(for: newList))
                        Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(ListPalette.color(for: newList))
                    .padding(.horizontal, 10).frame(height: 32)
                    .background(ListPalette.color(for: newList).opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                }
                TextField("Add to queue…", text: $newTitle)
                    .focused($composing)
                    .submitLabel(.done)
                    .onSubmit { submit() }
            }
            .padding(.horizontal, 6).frame(height: 46)
            .background(.white, in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.hairline))

            Button { submit() } label: {
                Image(systemName: "plus").font(.system(size: 18, weight: .medium)).foregroundStyle(.white)
                    .frame(width: 46, height: 46).background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
            }
            .accessibilityLabel("Add task")
            .disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
        }
    }

    private func submit() {
        let title = newTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        guard session.isAuthed else { session.showUnlock = true; return }
        newTitle = ""
        Task { await focus.addTask(title: title, list: newList) }
    }
}

/// What the Focus queue is filtered to. The two time filters and the four lists are one
/// single-choice row: a task is in exactly one list, and "Today" is a slice across all of them.
enum QueueFilter: Hashable {
    case all
    case today
    case list(String)

    static let options: [QueueFilter] = [.all, .today, .list("work"), .list("study"), .list("hustle"), .list("life")]

    var title: String {
        switch self {
        case .all: return "All"
        case .today: return "Today"
        case .list(let key): return ListPalette.label(for: key)
        }
    }

    /// The list colour, or nil for the two time filters.
    var tint: Color? {
        if case .list(let key) = self { return ListPalette.color(for: key) }
        return nil
    }
}

struct QueueRow: View {
    var task: QueuedTask
    var position: Int
    var isSelected: Bool
    var running: Bool
    var inRoundMs: Int

    var body: some View {
        HStack(spacing: 10) {
            Text(String(position))
                .font(.system(size: 11, weight: .semibold)).monospacedDigit()
                .foregroundStyle(isSelected ? Theme.violet : Theme.faint)
                .frame(width: 16)
            VStack(alignment: .leading, spacing: 3) {
                Text(task.title)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .medium)).lineLimit(1)
                HStack(spacing: 6) {
                    if isSelected {
                        Circle().fill(Theme.violet).frame(width: 6, height: 6)
                        Text("\(running ? "Working on" : "Paused") · \(inRoundMs.shortClockString) this pomodoro")
                            .foregroundStyle(Theme.violet).fontWeight(.semibold)
                    } else if inRoundMs > 0 {
                        Circle().fill(ListPalette.color(for: task.list)).frame(width: 6, height: 6)
                        Text("\(inRoundMs.shortClockString) this pomodoro").foregroundStyle(Theme.muted)
                    } else {
                        Text("Not started\(task.dueLabel.map { " · \($0)" } ?? "")").foregroundStyle(Theme.muted)
                    }
                }
                .font(.system(size: 10)).monospacedDigit()
            }
            Spacer(minLength: 4)
            ListChip(key: task.list)
        }
        .padding(.horizontal, 10).frame(height: 56)
        .background(isSelected ? .white : Theme.cardFill, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(isSelected ? Color(hex: 0xDDD6FE) : Theme.hairline))
    }
}
