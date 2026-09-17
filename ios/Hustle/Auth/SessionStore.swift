import Foundation
import SwiftUI

/// Whether this device holds a valid dashboard session cookie.
///
/// Reads are always allowed by the server; every write needs the cookie. The store checks
/// once on launch and again whenever a write comes back 401.
@MainActor
final class SessionStore: ObservableObject {
    @Published var isAuthed = false
    @Published var checking = true
    @Published var showUnlock = false
    @Published var lastError: String?

    func refresh() async {
        checking = true
        isAuthed = await APIClient.shared.sessionIsValid()
        checking = false
    }

    func unlock(code: String) async -> Bool {
        do {
            try await APIClient.shared.unlock(code: code)
            isAuthed = true
            showUnlock = false
            lastError = nil
            return true
        } catch {
            lastError = "Wrong code"
            isAuthed = false
            return false
        }
    }

    /// Wrap any write: on 401 the unlock sheet is raised instead of surfacing an error.
    func requireAuth(_ action: () async throws -> Void) async {
        guard isAuthed else { showUnlock = true; return }
        do {
            try await action()
        } catch APIClient.HTTPError.unauthorized {
            isAuthed = false
            showUnlock = true
        } catch {
            lastError = error.localizedDescription
        }
    }
}

struct UnlockSheet: View {
    @EnvironmentObject var session: SessionStore
    @State private var code = ""
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 18) {
            Capsule().fill(Theme.hairline).frame(width: 40, height: 5).padding(.top, 8)
            Theme.label("Passcode", color: Theme.muted)
            SecureField("Code", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .multilineTextAlignment(.center)
                .font(.system(size: 28, weight: .light, design: .monospaced))
                .padding(.vertical, 12)
                .background(Theme.hairlineSoft, in: RoundedRectangle(cornerRadius: 14))
                .focused($focused)
                .onSubmit { Task { await submit() } }
            if let error = session.lastError {
                Text(error).font(.footnote).foregroundStyle(Theme.rose)
            }
            Button { Task { await submit() } } label: { Text("Unlock").blackPill() }
                .disabled(code.isEmpty)
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.height(300)])
        .onAppear { focused = true }
    }

    private func submit() async {
        if await session.unlock(code: code) { code = "" } else { code = "" }
    }
}
