import SwiftUI

/// One priority-ordered queue. Index 0 is "Working on". Drag rows to reorder; the top row
/// becomes the task being worked on. The clock is one 30-minute pomodoro shared by all rows.
struct FocusView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var focus: FocusStore
    @Binding var showLockMode: Bool
    @State private var newTitle = ""
    @State private var newList = "work"
    @State private var filterToday = false
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

    private var header: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Focus").font(.system(size: 28, weight: .bold, design: .serif)).tracking(-0.5)
                Theme.label(round == nil
                            ? "\(focus.engine.tasks.count) in queue"
                            : "Pomodoro · \(Int(round!.remainingMs).clockString) left · \(focus.engine.tasks.count) in queue",
                            color: Theme.muted)
            }
            Spacer()
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

    private var visibleTasks: [QueuedTask] {
        filterToday ? focus.engine.tasks.filter { $0.group == "today" || $0.group == "overdue" } : focus.engine.tasks
    }

    private var queueHeader: some View {
        HStack {
            Theme.label("Queue · drag to reorder")
            Spacer()
            HStack(spacing: 2) {
                filterPill("All", on: !filterToday) { filterToday = false }
                filterPill("Today", on: filterToday) { filterToday = true }
            }
            .padding(2).background(.white, in: Capsule()).overlay(Capsule().stroke(Theme.hairline))
        }
    }

    private func filterPill(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title).font(.system(size: 10, weight: .semibold))
                .foregroundStyle(on ? .white : Theme.muted)
                .padding(.horizontal, 9).frame(height: 18)
                .background(on ? Theme.ink : .clear, in: Capsule())
        }
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
                guard !filterToday else { return }   // reorder only over the full queue
                focus.move(fromOffsets: from, toOffset: to)
            }
            if focus.loadingTasks && focus.engine.tasks.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear).listRowSeparator(.hidden)
            } else if focus.engine.tasks.isEmpty {
                Text(session.isAuthed ? "Queue is empty — add a task below." : "Unlock to load your tasks.")
                    .font(.system(size: 13)).foregroundStyle(Theme.faint)
                    .frame(maxWidth: .infinity).padding(.top, 20)
                    .listRowBackground(Color.clear).listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.editMode, .constant(.active))   // always show drag handles
        .refreshable { await focus.loadTasks() }
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
