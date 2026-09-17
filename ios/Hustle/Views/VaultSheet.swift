import SwiftUI

struct VaultSheet: View {
    @EnvironmentObject var session: SessionStore
    @EnvironmentObject var dashboard: DashboardStore
    @State private var item = ""
    @State private var amount = ""

    var body: some View {
        let v = dashboard.vault
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Capsule().fill(Theme.hairline).frame(width: 40, height: 5).frame(maxWidth: .infinity).padding(.top, 4)

                HStack(spacing: 14) {
                    Image(systemName: "gift")
                        .font(.system(size: 24)).foregroundStyle(Theme.amber)
                        .frame(width: 52, height: 52)
                        .background(Color(hex: 0xFFFBEB), in: RoundedRectangle(cornerRadius: 16))
                    VStack(alignment: .leading, spacing: 2) {
                        Theme.label("Reward Vault")
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text("¥\(v.balance)").font(.system(size: 34, weight: .light)).tracking(-1).monospacedDigit()
                            Text("earned ¥\(v.totalEarned) · spent ¥\(v.totalSpent)").font(.system(size: 11)).foregroundStyle(Theme.faint)
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Theme.label("Next milestones")
                        Spacer()
                        Text("¥\(Vault.productivityReward) per \(Vault.tasksPerReward) tasks or \(Vault.focusMinutesPerReward / 60) focus hrs")
                            .font(.system(size: 11)).foregroundStyle(Theme.faint)
                    }
                    VStack(spacing: 12) {
                        milestone(icon: "checkmark.circle", tint: Theme.emerald, title: "Tasks logged",
                                  progress: Double(v.totalTasks % Vault.tasksPerReward) / Double(Vault.tasksPerReward),
                                  text: "\(v.totalTasks % Vault.tasksPerReward) / \(Vault.tasksPerReward)")
                        milestone(icon: "timer", tint: Theme.violet, title: "Focus time",
                                  progress: Double(v.totalFocusMinutes % Vault.focusMinutesPerReward) / Double(Vault.focusMinutesPerReward),
                                  text: "\(Format.hours(v.totalFocusMinutes % Vault.focusMinutesPerReward)) / \(Format.hours(Vault.focusMinutesPerReward))")
                        milestone(icon: "dumbbell", tint: Theme.rose, title: "Smoke-free workouts",
                                  progress: Double(v.qualifyingExercises % Vault.exercisesPerReward) / Double(Vault.exercisesPerReward),
                                  text: "\(v.qualifyingExercises % Vault.exercisesPerReward) / \(Vault.exercisesPerReward)")
                    }
                    .padding(14)
                    .background(Color(hex: 0xFAFAFA), in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairlineSoft))
                }

                VStack(alignment: .leading, spacing: 10) {
                    Theme.label("Redeem")
                    HStack(spacing: 8) {
                        TextField("What for?", text: $item)
                            .padding(.horizontal, 14).frame(height: 46)
                            .background(Color(hex: 0xFAFAFA), in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.hairline))
                        TextField("¥", text: $amount).keyboardType(.numberPad)
                            .padding(.horizontal, 12).frame(width: 76, height: 46)
                            .background(Color(hex: 0xFAFAFA), in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.hairline))
                        Button {
                            guard let cost = Int(amount), cost > 0, !item.isEmpty else { return }
                            Task {
                                await session.requireAuth { try await dashboard.spend(item: item, cost: cost) }
                                item = ""; amount = ""
                            }
                        } label: {
                            Text("Spend").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white)
                                .padding(.horizontal, 16).frame(height: 46)
                                .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14))
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Theme.label("Recent")
                    VStack(spacing: 0) {
                        ForEach(dashboard.purchases.prefix(10)) { p in
                            HStack(spacing: 10) {
                                Text(p.item_name).font(.system(size: 13))
                                Spacer()
                                Text(String(p.created_at.prefix(10))).font(.system(size: 11)).foregroundStyle(Theme.faint)
                                Text("−¥\(p.cost)").font(.system(size: 13, weight: .semibold)).monospacedDigit()
                            }
                            .padding(.horizontal, 14).frame(height: 44)
                            Divider().overlay(Theme.hairlineSoft)
                        }
                        if dashboard.purchases.isEmpty {
                            Text("Nothing redeemed yet").font(.system(size: 13)).foregroundStyle(Theme.faint).padding(14)
                        }
                    }
                    .background(.white, in: RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.hairlineSoft))
                }
            }
            .padding(20)
        }
        .presentationDetents([.large])
    }

    private func milestone(icon: String, tint: Color, title: String, progress: Double, text: String) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: icon).font(.system(size: 14)).foregroundStyle(tint).frame(width: 18)
                Text(title).font(.system(size: 13, weight: .medium))
                Spacer()
                Text(text).font(.system(size: 12)).foregroundStyle(Theme.muted).monospacedDigit()
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.hairline)
                    Capsule().fill(tint).frame(width: geo.size.width * min(1, max(0, progress)))
                }
            }
            .frame(height: 6)
        }
    }
}
