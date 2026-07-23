import SwiftUI

struct SwipeDeckView: View {
    @State private var currentIndex = 0
    @State private var scores: [BeautyTag: Int] = [:]
    @State private var acceptedTags: [BeautyTag: Int] = [:]
    @State private var rejectedTags: [BeautyTag: Int] = [:]
    @State private var completedCards: [SwipeChoice] = []
    @State private var showResults = false

    private let cards = SwipeCard.bridalBeautyDeck

    var body: some View {
        NavigationStack {
            ZStack {
                BridalPalette.background
                    .ignoresSafeArea()

                if showResults {
                    SwipeResultsView(
                        result: BridalBeautyResult(
                            scores: scores,
                            acceptedTags: acceptedTags,
                            rejectedTags: rejectedTags,
                            choices: completedCards
                        ),
                        restart: resetDeck
                    )
                    .transition(.opacity.combined(with: .move(edge: .trailing)))
                } else {
                    deckContent
                        .transition(.opacity)
                }
            }
            .animation(.spring(response: 0.48, dampingFraction: 0.88), value: showResults)
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var deckContent: some View {
        VStack(spacing: 18) {
            VStack(spacing: 10) {
                Text("THE BRIDAL BEAUTY EDIT")
                    .font(.caption)
                    .tracking(2.4)
                    .foregroundStyle(BridalPalette.secondaryText)

                Text("Choose what feels instinctively right.")
                    .font(.system(.title2, design: .serif))
                    .fontWeight(.regular)
                    .foregroundStyle(BridalPalette.primaryText)
                    .multilineTextAlignment(.center)

                Text("Right for yes. Left for no.")
                    .font(.footnote)
                    .foregroundStyle(BridalPalette.secondaryText)
            }
            .padding(.top, 18)
            .padding(.horizontal, 24)

            ProgressView(value: Double(currentIndex), total: Double(cards.count))
                .tint(BridalPalette.primaryText)
                .background(BridalPalette.hairline)
                .padding(.horizontal, 28)
                .accessibilityLabel("Deck progress")
                .accessibilityValue("\(currentIndex) of \(cards.count)")

            Spacer(minLength: 4)

            ZStack {
                ForEach(visibleCards) { card in
                    let depth = depthIndex(for: card)

                    SwipeCardView(
                        card: card,
                        isTopCard: card.id == cards[currentIndex].id,
                        onSwipe: handleSwipe
                    )
                    .scaleEffect(1 - CGFloat(depth) * 0.035)
                    .offset(y: CGFloat(depth) * 12)
                    .zIndex(Double(cards.count - depth))
                    .allowsHitTesting(card.id == cards[currentIndex].id)
                    .accessibilityHidden(card.id != cards[currentIndex].id)
                }
            }
            .frame(maxWidth: 430)
            .padding(.horizontal, 18)

            HStack(spacing: 18) {
                SwipeActionButton(systemName: "xmark", label: "No") {
                    handleSwipe(.reject, card: cards[currentIndex])
                }

                VStack(spacing: 4) {
                    Text("\(min(currentIndex + 1, cards.count)) / \(cards.count)")
                        .font(.caption)
                        .tracking(1.1)
                        .foregroundStyle(BridalPalette.primaryText)

                    Text("No visible labels influence the result.")
                        .font(.caption2)
                        .foregroundStyle(BridalPalette.secondaryText)
                }
                .frame(width: 132)

                SwipeActionButton(systemName: "heart", label: "Yes") {
                    handleSwipe(.accept, card: cards[currentIndex])
                }
            }
            .padding(.bottom, 22)
        }
    }

    private var visibleCards: [SwipeCard] {
        guard currentIndex < cards.count else { return [] }
        return Array(cards[currentIndex..<min(currentIndex + 3, cards.count)]).reversed()
    }

    private func depthIndex(for card: SwipeCard) -> Int {
        guard let index = cards.firstIndex(where: { $0.id == card.id }) else { return 0 }
        return max(0, index - currentIndex)
    }

    private func handleSwipe(_ direction: SwipeDirection, card: SwipeCard) {
        guard currentIndex < cards.count, card.id == cards[currentIndex].id else { return }

        let isAcceptance = direction == .accept
        completedCards.append(SwipeChoice(card: card, direction: direction))

        for tag in card.tags {
            let value = tag.weight * (isAcceptance ? 1 : -1)
            scores[tag.tag, default: 0] += value

            if isAcceptance {
                acceptedTags[tag.tag, default: 0] += tag.weight
            } else {
                rejectedTags[tag.tag, default: 0] += tag.weight
            }
        }

        if currentIndex == cards.count - 1 {
            withAnimation {
                showResults = true
            }
        } else {
            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                currentIndex += 1
            }
        }
    }

    private func resetDeck() {
        withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) {
            currentIndex = 0
            scores = [:]
            acceptedTags = [:]
            rejectedTags = [:]
            completedCards = []
            showResults = false
        }
    }
}

private struct SwipeCardView: View {
    let card: SwipeCard
    let isTopCard: Bool
    let onSwipe: (SwipeDirection, SwipeCard) -> Void

    @State private var offset: CGSize = .zero
    @State private var isLeaving = false

    private var rotation: Angle {
        .degrees(Double(offset.width / 18))
    }

    private var decisionOpacity: Double {
        min(1, abs(offset.width) / 120)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .bottomLeading) {
                Image(card.imageName)
                    .resizable()
                    .scaledToFill()
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .clipped()
                    .overlay(cardGradient)

                decisionBadge
                    .padding(22)

                VStack(alignment: .leading, spacing: 8) {
                    Text(card.editorialCue.uppercased())
                        .font(.caption2)
                        .tracking(1.8)
                        .foregroundStyle(.white.opacity(0.72))

                    Text(card.caption)
                        .font(.system(.title2, design: .serif))
                        .fontWeight(.regular)
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.82)
                }
                .padding(24)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(.white.opacity(0.22), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.18), radius: 24, x: 0, y: 18)
        }
        .aspectRatio(0.72, contentMode: .fit)
        .offset(offset)
        .rotationEffect(rotation)
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: offset)
        .gesture(dragGesture)
    }

    private var cardGradient: some View {
        LinearGradient(
            colors: [
                .black.opacity(0.04),
                .black.opacity(0.16),
                .black.opacity(0.58)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    private var decisionBadge: some View {
        let isYes = offset.width > 0

        return Text(isYes ? "YES" : "NO")
            .font(.caption)
            .fontWeight(.semibold)
            .tracking(2)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 9)
            .background(.white.opacity(0.16), in: Capsule())
            .overlay(
                Capsule()
                    .stroke(.white.opacity(0.5), lineWidth: 1)
            )
            .opacity(decisionOpacity)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: isYes ? .topLeading : .topTrailing)
            .rotationEffect(.degrees(isYes ? -9 : 9))
            .padding(22)
    }

    private var dragGesture: some Gesture {
        DragGesture()
            .onChanged { value in
                guard isTopCard, !isLeaving else { return }
                offset = value.translation
            }
            .onEnded { value in
                guard isTopCard, !isLeaving else { return }

                if value.predictedEndTranslation.width > 145 || value.translation.width > 110 {
                    leave(.accept)
                } else if value.predictedEndTranslation.width < -145 || value.translation.width < -110 {
                    leave(.reject)
                } else {
                    offset = .zero
                }
            }
    }

    private func leave(_ direction: SwipeDirection) {
        isLeaving = true

        withAnimation(.spring(response: 0.34, dampingFraction: 0.78)) {
            offset = CGSize(
                width: direction == .accept ? 620 : -620,
                height: offset.height * 0.35
            )
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            onSwipe(direction, card)
            offset = .zero
            isLeaving = false
        }
    }
}

private struct SwipeActionButton: View {
    let systemName: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(BridalPalette.primaryText)
                .frame(width: 54, height: 54)
                .background(BridalPalette.surface, in: Circle())
                .overlay(
                    Circle()
                        .stroke(BridalPalette.hairline, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

private struct SwipeResultsView: View {
    let result: BridalBeautyResult
    let restart: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("YOUR BRIDAL BEAUTY DIRECTION")
                        .font(.caption)
                        .tracking(2.2)
                        .foregroundStyle(BridalPalette.secondaryText)

                    Text(result.title)
                        .font(.system(.largeTitle, design: .serif))
                        .fontWeight(.regular)
                        .foregroundStyle(BridalPalette.primaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(result.summary)
                        .font(.body)
                        .lineSpacing(5)
                        .foregroundStyle(BridalPalette.secondaryText)
                }

                ResultSection(title: "What she consistently chose", body: result.consistentlyChose)
                ResultSection(title: "What she consistently rejected", body: result.consistentlyRejected)
                ResultSection(title: "Hair direction", body: result.hairDirection)
                ResultSection(title: "Makeup direction", body: result.makeupDirection)
                ResultSection(title: "What she can stop searching for", body: result.stopSearchingFor)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Expert translation")
                        .font(.caption)
                        .tracking(1.6)
                        .textCase(.uppercase)
                        .foregroundStyle(BridalPalette.secondaryText)

                    Text(result.translationNote)
                        .font(.system(.body, design: .serif))
                        .italic()
                        .lineSpacing(5)
                        .foregroundStyle(BridalPalette.primaryText)
                }
                .padding(18)
                .background(BridalPalette.blush, in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                Button(action: restart) {
                    Text("Refine the edit")
                        .font(.caption)
                        .fontWeight(.semibold)
                        .tracking(1.8)
                        .textCase(.uppercase)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(BridalPalette.primaryText)
                }
                .buttonStyle(.plain)
                .padding(.top, 6)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 28)
            .frame(maxWidth: 680, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(BridalPalette.background)
    }
}

private struct ResultSection: View {
    let title: String
    let body: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .tracking(1.5)
                .textCase(.uppercase)
                .foregroundStyle(BridalPalette.secondaryText)

            Text(body)
                .font(.body)
                .lineSpacing(4)
                .foregroundStyle(BridalPalette.primaryText)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 2)
    }
}

private struct BridalBeautyResult {
    let title: String
    let summary: String
    let consistentlyChose: String
    let consistentlyRejected: String
    let hairDirection: String
    let makeupDirection: String
    let stopSearchingFor: String
    let translationNote: String

    init(
        scores: [BeautyTag: Int],
        acceptedTags: [BeautyTag: Int],
        rejectedTags: [BeautyTag: Int],
        choices: [SwipeChoice]
    ) {
        let profile = BeautyProfile(scores: scores, acceptedTags: acceptedTags, rejectedTags: rejectedTags, choices: choices)
        title = profile.title
        summary = profile.summary
        consistentlyChose = profile.consistentlyChose
        consistentlyRejected = profile.consistentlyRejected
        hairDirection = profile.hairDirection
        makeupDirection = profile.makeupDirection
        stopSearchingFor = profile.stopSearchingFor
        translationNote = profile.translationNote
    }
}

private struct BeautyProfile {
    let scores: [BeautyTag: Int]
    let acceptedTags: [BeautyTag: Int]
    let rejectedTags: [BeautyTag: Int]
    let choices: [SwipeChoice]

    private var preferredTags: [BeautyTag] {
        ranked(acceptedTags, minimum: 2)
    }

    private var rejectedPatterns: [BeautyTag] {
        ranked(rejectedTags, minimum: 2)
    }

    private var netTags: [BeautyTag] {
        ranked(scores, minimum: 1)
    }

    var title: String {
        if likes(.structured) && likes(.editorial) && dislikes(.lowStructure) {
            return "Polished Editorial Bride"
        }

        if likes(.soft) && likes(.romantic) && dislikes(.definedEyes) {
            return "Soft Romantic Bride"
        }

        if likes(.natural) && likes(.minimal) && dislikes(.glam) {
            return "Quietly Polished Bride"
        }

        if likes(.classic) && likes(.longwear) {
            return "Modern Classic Bride"
        }

        return "Refined Bridal Beauty"
    }

    var summary: String {
        if likes(.structured) {
            return "Her eye is going to shape, intention, and definition. The final look should feel controlled without becoming severe."
        }

        if likes(.soft) {
            return "Her choices favor ease, movement, and romance. The final look should stay soft, but it still needs enough architecture to photograph cleanly."
        }

        if likes(.natural) {
            return "She is choosing restraint over decoration. The best direction is clean, expensive, and quietly enhanced."
        }

        return "The pattern is balanced: polished enough for the camera, soft enough to still feel personal."
    }

    var consistentlyChose: String {
        phrase(for: preferredTags, fallback: "Clean bridal polish, controlled softness, and beauty choices that feel intentional rather than overworked.")
    }

    var consistentlyRejected: String {
        phrase(for: rejectedPatterns, fallback: "Looks that read too literal, too undone, or too trend-led once separated from the reference image.")
    }

    var hairDirection: String {
        if likes(.updo) && likes(.structured) {
            return "A sculpted updo or tucked shape with clean face-framing. Keep the silhouette deliberate and the finish refined."
        }

        if likes(.updo) && likes(.soft) {
            return "A loose updo with controlled softness. It can move, but it should not collapse into messy texture."
        }

        if likes(.waves) && likes(.structured) {
            return "Polished waves with a defined bend pattern, clean crown, and enough hold to survive photos, humidity, and movement."
        }

        if likes(.waves) {
            return "Soft waves with airy movement, edited volume, and face-framing that feels romantic without looking casual."
        }

        return "A refined shape with clean edges, intentional face-framing, and less visual noise around the neckline."
    }

    var makeupDirection: String {
        if likes(.definedEyes) && likes(.softFocusSkin) {
            return "Soft-focus skin, quiet sculpting, and a defined eye that gives the face structure without pushing into heavy glam."
        }

        if likes(.glowySkin) && likes(.minimal) {
            return "Fresh skin, restrained eye definition, and glow placed with discipline so the finish reads luminous, not shiny."
        }

        if likes(.glam) {
            return "Camera-aware definition: lifted eyes, polished skin, and strategic depth balanced with a bridal softness."
        }

        return "Elevated natural makeup with skin refinement, subtle dimension, and details that hold up in professional photography."
    }

    var stopSearchingFor: String {
        if dislikes(.lowStructure) || dislikes(.messyTexture) {
            return "Undone texture, overly loose tendrils, and references that only work because the model is standing still in perfect light."
        }

        if dislikes(.glam) || dislikes(.definedEyes) {
            return "Heavy eye references, dramatic before-and-after makeup, and anything that makes the makeup the first thing people notice."
        }

        if dislikes(.minimal) || dislikes(.natural) {
            return "Barely-there bridal images that look beautiful online but may disappear in person, in photos, or under evening lighting."
        }

        return "More screenshots that repeat the same feeling. The direction is already clear; the next decision is execution."
    }

    var translationNote: String {
        "The useful signal is not one favorite image. It is the repetition: what she kept protecting, and what she kept editing out. That is the beauty brief."
    }

    private func likes(_ tag: BeautyTag) -> Bool {
        scores[tag, default: 0] > 0 || acceptedTags[tag, default: 0] >= 2
    }

    private func dislikes(_ tag: BeautyTag) -> Bool {
        scores[tag, default: 0] < 0 || rejectedTags[tag, default: 0] >= 2
    }

    private func ranked(_ values: [BeautyTag: Int], minimum: Int) -> [BeautyTag] {
        values
            .filter { $0.value >= minimum }
            .sorted {
                if $0.value == $1.value {
                    return $0.key.displayName < $1.key.displayName
                }

                return $0.value > $1.value
            }
            .prefix(4)
            .map(\.key)
    }

    private func phrase(for tags: [BeautyTag], fallback: String) -> String {
        guard tags.isEmpty == false else { return fallback }

        let names = tags.map(\.editorialPhrase)

        if names.count == 1 {
            return names[0]
        }

        return names.dropLast().joined(separator: ", ") + ", and " + names.last!
    }
}

private struct SwipeCard: Identifiable, Equatable {
    let id: String
    let imageName: String
    let caption: String
    let editorialCue: String
    let tags: [WeightedBeautyTag]

    static let bridalBeautyDeck: [SwipeCard] = [
        SwipeCard(
            id: "structured-waves",
            imageName: "structured_waves_1",
            caption: "Polished waves with a deliberate bend.",
            editorialCue: "Hair shape",
            tags: [.init(.structured, 3), .init(.waves, 3), .init(.polished, 2), .init(.editorial, 2), .init(.longwear, 1)]
        ),
        SwipeCard(
            id: "soft-waves",
            imageName: "soft_waves_1",
            caption: "Soft waves with air and movement.",
            editorialCue: "Hair shape",
            tags: [.init(.soft, 3), .init(.waves, 3), .init(.romantic, 2), .init(.movement, 2), .init(.lowStructure, 1)]
        ),
        SwipeCard(
            id: "polished-updo",
            imageName: "polished_updo_1",
            caption: "A clean updo with sculpted restraint.",
            editorialCue: "Silhouette",
            tags: [.init(.structured, 3), .init(.updo, 3), .init(.classic, 2), .init(.polished, 2), .init(.longwear, 1)]
        ),
        SwipeCard(
            id: "loose-updo",
            imageName: "loose_updo_1",
            caption: "A romantic updo with softness around the face.",
            editorialCue: "Silhouette",
            tags: [.init(.soft, 3), .init(.updo, 3), .init(.romantic, 2), .init(.movement, 2), .init(.lowStructure, 1)]
        ),
        SwipeCard(
            id: "soft-focus-skin",
            imageName: "soft_focus_skin_1",
            caption: "Skin that looks refined, dimensional, and camera-ready.",
            editorialCue: "Complexion",
            tags: [.init(.softFocusSkin, 3), .init(.polished, 2), .init(.editorial, 2), .init(.longwear, 2), .init(.classic, 1)]
        ),
        SwipeCard(
            id: "glowy-skin",
            imageName: "glowy_skin_1",
            caption: "A luminous skin finish with visible freshness.",
            editorialCue: "Complexion",
            tags: [.init(.glowySkin, 3), .init(.natural, 2), .init(.soft, 2), .init(.minimal, 1), .init(.movement, 1)]
        ),
        SwipeCard(
            id: "defined-eye",
            imageName: "defined_eye_1",
            caption: "A defined eye that gives the face structure.",
            editorialCue: "Makeup focus",
            tags: [.init(.definedEyes, 3), .init(.glam, 2), .init(.editorial, 2), .init(.polished, 1), .init(.longwear, 1)]
        ),
        SwipeCard(
            id: "minimal-eye",
            imageName: "minimal_eye_1",
            caption: "A quiet eye with barely-there definition.",
            editorialCue: "Makeup focus",
            tags: [.init(.minimal, 3), .init(.natural, 2), .init(.soft, 2), .init(.romantic, 1), .init(.glowySkin, 1)]
        ),
        SwipeCard(
            id: "clean-hairline",
            imageName: "clean_hairline_1",
            caption: "Clean face-framing with an edited hairline.",
            editorialCue: "Detail",
            tags: [.init(.cleanHairline, 3), .init(.structured, 2), .init(.polished, 2), .init(.editorial, 1), .init(.classic, 1)]
        ),
        SwipeCard(
            id: "messy-texture",
            imageName: "messy_texture_1",
            caption: "Undone texture with loose, imperfect pieces.",
            editorialCue: "Detail",
            tags: [.init(.messyTexture, 3), .init(.lowStructure, 3), .init(.movement, 2), .init(.romantic, 1), .init(.soft, 1)]
        )
    ]
}

private struct WeightedBeautyTag: Hashable {
    let tag: BeautyTag
    let weight: Int

    init(_ tag: BeautyTag, _ weight: Int) {
        self.tag = tag
        self.weight = weight
    }
}

private struct SwipeChoice: Identifiable {
    let id = UUID()
    let card: SwipeCard
    let direction: SwipeDirection
}

private enum SwipeDirection {
    case accept
    case reject
}

private enum BeautyTag: String, Hashable {
    case classic
    case cleanHairline
    case definedEyes
    case editorial
    case glam
    case glowySkin
    case longwear
    case lowStructure
    case messyTexture
    case minimal
    case movement
    case natural
    case polished
    case romantic
    case soft
    case softFocusSkin
    case structured
    case updo
    case waves

    var displayName: String {
        switch self {
        case .classic: return "classic structure"
        case .cleanHairline: return "clean face-framing"
        case .definedEyes: return "defined eyes"
        case .editorial: return "editorial polish"
        case .glam: return "visible glam"
        case .glowySkin: return "glowy skin"
        case .longwear: return "longwear finish"
        case .lowStructure: return "low structure"
        case .messyTexture: return "messy texture"
        case .minimal: return "minimal detail"
        case .movement: return "movement"
        case .natural: return "natural restraint"
        case .polished: return "polish"
        case .romantic: return "romance"
        case .soft: return "softness"
        case .softFocusSkin: return "soft-focus skin"
        case .structured: return "structure"
        case .updo: return "updos"
        case .waves: return "waves"
        }
    }

    var editorialPhrase: String {
        switch self {
        case .classic: return "classic references with modern restraint"
        case .cleanHairline: return "clean face-framing and an edited hairline"
        case .definedEyes: return "eye definition that holds the face in photographs"
        case .editorial: return "an editorial finish rather than a casual beauty moment"
        case .glam: return "visible polish and stronger makeup architecture"
        case .glowySkin: return "fresh luminosity"
        case .longwear: return "beauty choices designed to last beyond the getting-ready light"
        case .lowStructure: return "an intentionally undone finish"
        case .messyTexture: return "imperfect texture and looseness"
        case .minimal: return "restraint and negative space"
        case .movement: return "movement instead of stiffness"
        case .natural: return "natural restraint"
        case .polished: return "a clean, finished read"
        case .romantic: return "romantic softness"
        case .soft: return "softness over sharpness"
        case .softFocusSkin: return "soft-focus skin refinement"
        case .structured: return "shape, control, and structure"
        case .updo: return "hair lifted into a composed silhouette"
        case .waves: return "hair worn down with a deliberate wave pattern"
        }
    }
}

private enum BridalPalette {
    static let background = Color(red: 0.975, green: 0.965, blue: 0.95)
    static let surface = Color(red: 1.0, green: 0.995, blue: 0.985)
    static let blush = Color(red: 0.935, green: 0.89, blue: 0.875)
    static let primaryText = Color(red: 0.12, green: 0.105, blue: 0.095)
    static let secondaryText = Color(red: 0.43, green: 0.40, blue: 0.37)
    static let hairline = Color(red: 0.78, green: 0.73, blue: 0.69)
}

#Preview {
    SwipeDeckView()
}
