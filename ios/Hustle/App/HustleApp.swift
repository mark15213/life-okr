import SwiftUI

@main
struct HustleApp: App {
    @StateObject private var session = SessionStore()
    @StateObject private var dashboard = DashboardStore()
    @StateObject private var focus = FocusStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(dashboard)
                .environmentObject(focus)
                .task {
                    await session.refresh()
                    await dashboard.refresh()
                    if session.isAuthed {
                        await focus.loadTasks()
                        await focus.pullSession()
                        await focus.flushUploads()
                    }
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        await dashboard.refresh()
                        if session.isAuthed { await focus.pullSession(); await focus.flushUploads() }
                    }
                }
                .onChange(of: session.isAuthed) { _, authed in
                    guard authed else { return }
                    Task { await focus.loadTasks(); await focus.pullSession() }
                }
        }
    }
}

enum Tab: Hashable { case today, focus, stats }

struct RootView: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var focus: FocusStore
    @State private var tab: Tab = .today
    @State private var showQuickLog = false
    @State private var showLockMode = false

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            TabView(selection: $tab) {
                TodayView(showLockMode: $showLockMode).tag(Tab.today)
                    .tabItem { Label("Today", systemImage: "house") }
                FocusView(showLockMode: $showLockMode).tag(Tab.focus)
                    .tabItem { Label("Focus", systemImage: "timer") }
                StatsView().tag(Tab.stats)
                    .tabItem { Label("Stats", systemImage: "chart.bar") }
            }
            .tint(Theme.ink)

            if tab == .today {
                Button { showQuickLog = true } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(.white)
                        .frame(width: 56, height: 56)
                        .background(Theme.ink, in: Circle())
                        .shadow(color: Theme.ink.opacity(0.35), radius: 16, y: 10)
                }
                .accessibilityLabel("Quick log")
                .padding(.trailing, 20)
                .padding(.bottom, 70)
            }
        }
        .sheet(isPresented: $showQuickLog) { QuickLogSheet(showLockMode: $showLockMode, switchToFocus: { tab = .focus }) }
        .sheet(isPresented: $session.showUnlock) { UnlockSheet() }
        .fullScreenCover(isPresented: $showLockMode) { LockModeView() }
        .onChange(of: focus.justCompleted) { _, round in
            // Auto-leave Lock mode a minute after a pomodoro finishes.
            guard round != nil, showLockMode else { return }
            Task { try? await Task.sleep(for: .seconds(60)); if focus.engine.current == nil { showLockMode = false } }
        }
    }
}
