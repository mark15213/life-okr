import SwiftUI

/// The phone-on-the-desk screen: clock, the shared pomodoro ring, the task being worked on,
/// and the queue. Swipe up → next task, swipe down → previous. Look, switch, never manage.
struct LockModeView: View {
    @EnvironmentObject var focus: FocusStore
    @Environment(\.dismiss) private var dismiss
    @State private var dragOffset: CGFloat = 0
    @State private var clock = Date()

    private var engine: FocusEngine { focus.engine }
    private var round: Round? { engine.current }

    private let clockTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: 0x18181B), Color(hex: 0x09090B)], center: .init(x: 0.5, y: 0.4),
                           startRadius: 0, endRadius: 520)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                clockHeader.padding(.top, 20)
                Spacer(minLength: 24)
                ringAndTask
                if !engine.queue(limit: 1).isEmpty {
                    upNext.padding(.top, 32)
                }
                Spacer(minLength: 0)
                controls
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 12)
        }
        .preferredColorScheme(.dark)
        .overlay(alignment: .topLeading) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(Theme.faint)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Back to Focus")
            .padding(.leading, 12)
        }
        .statusBarHidden(true)
        .contentShape(Rectangle())
        .gesture(swipe)
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .onReceive(clockTimer) { clock = $0 }
    }

    // MARK: Pieces

    private var clockHeader: some View {
        VStack(spacing: 6) {
            Text(clock.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute()))
                .font(.system(size: 42, weight: .light)).tracking(-1.5).monospacedDigit()
            Text(clock.formatted(.dateTime.weekday(.wide).month(.wide).day()).uppercased())
                .font(.system(size: 11, weight: .semibold)).tracking(1.6).foregroundStyle(Theme.muted)
        }
        .foregroundStyle(Color(hex: 0xFAFAFA))
    }

    private var ringAndTask: some View {
        VStack(spacing: 22) {
            ZStack {
                SegmentedRing(round: round, lineWidth: 6, track: Color(hex: 0x27272A), showHead: true)
                VStack(spacing: 6) {
                    Text(round == nil ? "READY" : (round?.status == .running ? "POMODORO" : "PAUSED"))
                        .font(.system(size: 10, weight: .semibold)).tracking(1.8).foregroundStyle(Theme.muted)
                    Text(Int(round?.remainingMs ?? engine.durationMs).clockString)
                        .font(.system(size: 56, weight: .light)).tracking(-2.2).monospacedDigit()
                        .foregroundStyle(Color(hex: 0xFAFAFA))
                }
            }
            .frame(width: 232, height: 232)

            VStack(spacing: 8) {
                Text(engine.selected?.title ?? "Queue is empty")
                    .font(.system(size: 22, weight: .semibold)).tracking(-0.2)
                    .foregroundStyle(Color(hex: 0xFAFAFA))
                    .multilineTextAlignment(.center).lineLimit(2)
                    .offset(y: dragOffset * 0.15)
                    .id(engine.selectedId)
                    .transition(.asymmetric(insertion: .move(edge: dragOffset < 0 ? .bottom : .top).combined(with: .opacity),
                                            removal: .move(edge: dragOffset < 0 ? .top : .bottom).combined(with: .opacity)))
                if let sel = engine.selected {
                    HStack(spacing: 8) {
                        darkChip(sel.list)
                        Text(Int(round?.totals()[sel.id] ?? 0).shortClockString)
                            .font(.system(size: 11)).foregroundStyle(Theme.muted).monospacedDigit()
                            .accessibilityLabel("Time on this task: \(Int(round?.totals()[sel.id] ?? 0).shortClockString)")
                    }
                }
            }
            .frame(maxWidth: 320)

        }
        .animation(.spring(duration: 0.28), value: engine.selectedId)
    }

    private var upNext: some View {
        VStack(spacing: 4) {
            HStack {
                Text("UP NEXT").font(.system(size: 10, weight: .semibold)).tracking(1.6).foregroundStyle(Color(hex: 0x52525B))
                Spacer()
                Button { focus.next() } label: {
                    HStack(spacing: 4) {
                        Text("SWIPE UP")
                        Image(systemName: "chevron.up").font(.system(size: 9, weight: .bold))
                    }
                    .font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(Theme.muted)
                }
                .disabled(engine.queue(limit: 1).isEmpty)
            }
            .padding(.horizontal, 4).padding(.bottom, 6)

            ForEach(Array(engine.queue(limit: 2).enumerated()), id: \.element.id) { i, t in
                Button { focus.select(t.id) } label: {
                    HStack(spacing: 12) {
                        Circle().fill(ListPalette.color(for: t.list)).frame(width: 5, height: 5)
                        Text(t.title).font(.system(size: 14, weight: .medium)).foregroundStyle(Color(hex: 0xD4D4D8)).lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 12).frame(height: 44)
                }
                .opacity([1, 0.72, 0.45][min(i, 2)])
            }
        }
    }

    private var controls: some View {
        HStack {
            Spacer()
            HStack(spacing: 10) {
                Button { focus.toggle() } label: {
                    Image(systemName: round?.status == .running ? "pause.fill" : "play.fill")
                        .font(.system(size: 14)).foregroundStyle(Color(hex: 0xFAFAFA))
                        .frame(width: 44, height: 44)
                        .background(Color(hex: 0x27272A).opacity(0.5), in: Circle())
                        .overlay(Circle().stroke(Color(hex: 0x27272A)))
                }
                .accessibilityLabel(round?.status == .running ? "Pause" : "Start")
                Button {
                    if let id = engine.selectedId { Task { await focus.complete(id) } }
                } label: {
                    Image(systemName: "checkmark").font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x09090B))
                        .frame(width: 44, height: 44).background(Color(hex: 0xFAFAFA), in: Circle())
                }
                .accessibilityLabel("Mark done")
                .disabled(engine.selected == nil)
            }
            Spacer()
        }
    }

    private func darkChip(_ key: String?) -> some View {
        Text(ListPalette.label(for: key))
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 9).frame(height: 20)
            .foregroundStyle(ListPalette.color(for: key).opacity(0.95))
            .background(ListPalette.color(for: key).opacity(0.22), in: RoundedRectangle(cornerRadius: 6))
    }

    // MARK: Gesture

    private var swipe: some Gesture {
        DragGesture(minimumDistance: 20)
            .onChanged { dragOffset = max(-60, min(60, $0.translation.height)) }
            .onEnded { value in
                let dy = value.translation.height
                let vy = value.predictedEndTranslation.height
                defer { withAnimation(.spring(duration: 0.3)) { dragOffset = 0 } }
                if dy < -60 || vy < -200 { focus.next() }          // swipe up → next
                else if dy > 60 || vy > 200 { focus.previous() }   // swipe down → previous
            }
    }
}
