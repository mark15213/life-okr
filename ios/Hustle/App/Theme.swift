import SwiftUI

/// The dashboard's look, carried over: warm off-white ground, white cards with thin zinc
/// borders, serif wordmark, uppercase tracked labels, big light numerals.
enum Theme {
    static let ink = Color(hex: 0x18181B)
    static let muted = Color(hex: 0x71717A)
    static let faint = Color(hex: 0xA1A1AA)
    static let hairline = Color(hex: 0xE4E4E7)
    static let hairlineSoft = Color(hex: 0xF4F4F5)
    static let cardFill = Color.white.opacity(0.88)

    static let rose = Color(hex: 0xF43F5E)
    static let violet = Color(hex: 0x8B5CF6)
    static let emerald = Color(hex: 0x10B981)
    static let pink = Color(hex: 0xEC4899)
    static let amber = Color(hex: 0xF59E0B)

    static var ground: some View {
        LinearGradient(
            colors: [Color(hex: 0xF8FAFC), .white, Color(hex: 0xF4F1EA)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        ).ignoresSafeArea()
    }

    /// The uppercase tracked label used for every card title and section header.
    static func label(_ text: String, color: Color = faint) -> some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .semibold))
            .tracking(1.4)
            .foregroundStyle(color)
    }
}

struct CardStyle: ViewModifier {
    var padding: CGFloat = 16
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Theme.cardFill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.hairline, lineWidth: 1))
            .shadow(color: Color(hex: 0x0F172A, opacity: 0.04), radius: 12, y: 8)
    }
}

extension View {
    func card(padding: CGFloat = 16) -> some View { modifier(CardStyle(padding: padding)) }

    /// The black pill used for primary actions.
    func blackPill(height: CGFloat = 48) -> some View {
        self
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(Theme.ink, in: Capsule())
    }
}

/// The small coloured list chip ("Work", "Study").
struct ListChip: View {
    var key: String?
    var body: some View {
        Text(ListPalette.label(for: key))
            .font(.system(size: 10, weight: .semibold))
            .padding(.horizontal, 8)
            .frame(height: 18)
            .foregroundStyle(ListPalette.color(for: key))
            .background(ListPalette.color(for: key).opacity(0.12), in: RoundedRectangle(cornerRadius: 6))
    }
}
