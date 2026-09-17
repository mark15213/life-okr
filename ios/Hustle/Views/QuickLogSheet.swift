import SwiftUI

/// The "+" panel: the two things logged most, then the four less frequent entries.
struct QuickLogSheet: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var dashboard: DashboardStore
    @EnvironmentObject var focus: FocusStore
    @Environment(\.dismiss) private var dismiss
    @Binding var showLockMode: Bool
    var switchToFocus: () -> Void

    @State private var showCalories = false
    @State private var calories = ""
    @State private var showBackfill = false
    @State private var busy = false

    var body: some View {
        VStack(spacing: 18) {
            Capsule().fill(Theme.hairline).frame(width: 40, height: 5).padding(.top, 4)

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Quick log").font(.system(size: 18, weight: .semibold))
                    Text("Saved to today · \(Date().formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()))")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                lockBadge
            }

            HStack(spacing: 12) {
                bigButton(icon: "smoke", title: "Smoke", delta: "+100 pushups", tint: Theme.rose) {
                    await session.requireAuth { try await dashboard.logCigarette() }
                }
                bigButton(icon: "dumbbell", title: "Workout", delta: "−100 pushups", tint: Theme.emerald) {
                    guard session.isAuthed else { session.showUnlock = true; return }
                    withAnimation { showCalories = true }
                }
            }

            if showCalories {
                VStack(alignment: .leading, spacing: 8) {
                    Theme.label("Calories burned (optional)")
                    HStack(spacing: 10) {
                        TextField("e.g. 320", text: $calories)
                            .keyboardType(.numberPad)
                            .padding(.horizontal, 14).frame(height: 44)
                            .background(Color(hex: 0xFAFAFA), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.hairline))
                        Button {
                            Task {
                                await session.requireAuth { try await dashboard.logExercise(calories: Int(calories) ?? 0) }
                                calories = ""; showCalories = false
                            }
                        } label: {
                            Text("Save").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                                .padding(.horizontal, 18).frame(height: 44)
                                .background(Theme.ink, in: RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
                .padding(14)
                .background(.white, in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.hairline))
            }

            VStack(spacing: 0) {
                row(icon: "timer", tint: Theme.violet, title: focus.engine.current == nil ? "Start a 30-min focus" : "Open Lock mode") {
                    if focus.engine.current == nil { focus.start() }
                    dismiss(); showLockMode = true
                }
                Divider().overlay(Theme.hairlineSoft)
                row(icon: "checklist", tint: Theme.emerald, title: "Add a task") { dismiss(); switchToFocus() }
                Divider().overlay(Theme.hairlineSoft)
                row(icon: "calendar", tint: Theme.muted, title: "Log a past day") {
                    guard session.isAuthed else { session.showUnlock = true; return }
                    showBackfill = true
                }
            }
            .background(.white, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.hairline))

            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.height(showCalories ? 560 : 470)])
        .presentationDragIndicator(.hidden)
        .sheet(isPresented: $showBackfill) { BackfillSheet() }
    }

    private var lockBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: session.isAuthed ? "lock.open" : "lock")
            Text(session.isAuthed ? "Unlocked" : "Locked")
        }
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(session.isAuthed ? Color(hex: 0x059669) : Theme.muted)
        .padding(.horizontal, 10).frame(height: 28)
        .background((session.isAuthed ? Color(hex: 0xECFDF5) : Theme.hairlineSoft), in: Capsule())
        .onTapGesture { if !session.isAuthed { session.showUnlock = true } }
    }

    private func bigButton(icon: String, title: String, delta: String, tint: Color, action: @escaping () async -> Void) -> some View {
        Button {
            guard !busy else { return }
            Task { busy = true; await action(); busy = false; UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
        } label: {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 18)).foregroundStyle(Color(hex: 0x52525B))
                    .frame(width: 40, height: 40)
                    .background(.white, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.hairline))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink)
                    Text(delta).font(.system(size: 12, weight: .medium)).foregroundStyle(tint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(hex: 0xFAFAFA), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.hairline))
        }
        .buttonStyle(.plain)
        .opacity(session.isAuthed ? 1 : 0.5)
    }

    private func row(icon: String, tint: Color, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 15)).foregroundStyle(tint).frame(width: 20)
                Text(title).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.faint)
            }
            .padding(.horizontal, 16).frame(height: 52)
        }
        .buttonStyle(.plain)
    }
}

struct BackfillSheet: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var dashboard: DashboardStore
    @Environment(\.dismiss) private var dismiss
    @State private var date = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
    @State private var exercises = 0
    @State private var focusMinutes = ""
    @State private var tasks = ""

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
                Stepper("Workouts: \(exercises)", value: $exercises, in: 0...20)
                TextField("Focus minutes", text: $focusMinutes).keyboardType(.numberPad)
                TextField("Tasks completed", text: $tasks).keyboardType(.numberPad)
            }
            .navigationTitle("Log a past day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "Asia/Shanghai")
                        Task {
                            await session.requireAuth {
                                try await APIClient.shared.backfill(date: f.string(from: date), exercises: exercises,
                                                                    focus: Int(focusMinutes) ?? 0, tasks: Int(tasks) ?? 0)
                                await dashboard.refresh()
                            }
                            dismiss()
                        }
                    }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
    }
}
