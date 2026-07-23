import SwiftUI
import UIKit

struct SwipeDeckView: View {
    let isAuthenticated: Bool
    let revealResultsOnAppear: Bool
    let authenticatedUserID: String?
    let authenticatedAccessToken: String?
    var onDismiss: (() -> Void)? = nil
    var onRequireAccount: ((String) -> Void)? = nil
    var onPreferenceUpdate: ((SwipePreferencePayload) -> Void)? = nil

    private let cardAspectRatio: CGFloat = 4.0 / 5.35
    private let maxCardWidth: CGFloat = 390

    @State private var cards: [SwipeCard] = SwipeCard.bridalBeautyDeck
    @State private var baseSessionCards: [SwipeCard] = SwipeCard.bridalBeautyDeck
    @State private var currentIndex = 0
    @State private var likedCards: [SwipeCard] = []
    @State private var superLikedCards: [SwipeCard] = []
    @State private var dislikedCards: [SwipeCard] = []
    @State private var acceptedTags: [BridalStyle: Int] = [:]
    @State private var rejectedTags: [BridalStyle: Int] = [:]
    @State private var swipeProfile = SwipeProfile()
    @State private var showResults = false
    @State private var isLoadingCards = false
    @State private var showAccountGate = false
    @State private var loadError: String?
    @State private var hasLoadedSessionCards = false
    @State private var failedImageCardIDs: Set<String> = []
    @State private var preloadedImageURLs: Set<String> = []
    @State private var isSavingBridalDirection = false
    @State private var hasSavedBridalDirection = false
    @State private var saveBridalDirectionError: String?

    init(
        isAuthenticated: Bool = false,
        revealResultsOnAppear: Bool = false,
        authenticatedUserID: String? = nil,
        authenticatedAccessToken: String? = nil,
        onDismiss: (() -> Void)? = nil,
        onRequireAccount: ((String) -> Void)? = nil,
        onPreferenceUpdate: ((SwipePreferencePayload) -> Void)? = nil
    ) {
        self.isAuthenticated = isAuthenticated
        self.revealResultsOnAppear = revealResultsOnAppear
        self.authenticatedUserID = authenticatedUserID
        self.authenticatedAccessToken = authenticatedAccessToken
        self.onDismiss = onDismiss
        self.onRequireAccount = onRequireAccount
        self.onPreferenceUpdate = onPreferenceUpdate
    }

    var body: some View {
        NavigationView {
            ZStack {
                BridalPalette.background
                    .ignoresSafeArea()

                if showResults {
                    resultsView
                } else if cards.isEmpty {
                    emptyPortfolioView
                } else {
                    deckView
                }
            }
            .overlay(alignment: .topLeading) {
                if !showResults {
                    Button {
                        onDismiss?()
                    } label: {
                        Text("← Exit")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(BridalPalette.primaryText)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                            .background(BridalPalette.background.opacity(0.92))
                            .overlay(
                                RoundedRectangle(cornerRadius: 18)
                                    .stroke(BridalPalette.primaryText.opacity(0.18), lineWidth: 0.5)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 18))
                    }
                    .padding(.top, 16)
                    .padding(.leading, 16)
                }
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showAccountGate) {
                AccountGateView(
                    mode: .results,
                    onCreateAccount: {
                        showAccountGate = false
                        onRequireAccount?(AccountGateMode.results.rawValue)
                    },
                    onSignIn: {
                        showAccountGate = false
                        onRequireAccount?(AccountGateMode.results.rawValue)
                    }
                )
            }
            .onAppear {
                if isAuthenticated && revealResultsOnAppear {
                    showResults = true
                }
            }
            .task {
                await loadPortfolioCards()
            }
        }
    }

    private var deckView: some View {
        VStack(spacing: 18) {
            header
            if isLoadingCards {
                Text("Adding artist portfolio photos...")
                    .font(.caption.weight(.semibold))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundColor(BridalPalette.secondaryText)
            }

            GeometryReader { proxy in
                let cardWidth = min(proxy.size.width, maxCardWidth)
                let cardHeight = cardWidth / cardAspectRatio

                ZStack {
                    ForEach(Array(visibleCards.enumerated()), id: \.element.id) { offset, card in
                        SwipeCardView(
                            card: card,
                            cardSize: CGSize(width: cardWidth, height: cardHeight),
                            isTopCard: offset == 0,
                            onSwipe: recordCurrentCard,
                            onImageFailure: handleImageFailure
                        )
                            .scaleEffect(1 - CGFloat(offset) * 0.04)
                            .offset(y: CGFloat(offset) * 12)
                            .zIndex(Double(visibleCards.count - offset))
                    }
                }
                .frame(width: proxy.size.width, height: cardHeight, alignment: .top)
            }
            .frame(maxWidth: .infinity)
            .frame(height: min((UIScreen.main.bounds.width - 40), maxCardWidth) / cardAspectRatio + 28)

            HStack(spacing: 22) {
                Button {
                    recordCurrentCard(action: .dislike)
                } label: {
                    Image(systemName: "xmark")
                        .font(.title2.weight(.semibold))
                        .frame(width: 62, height: 62)
                }
                .buttonStyle(.borderedProminent)
                .tint(BridalPalette.surface)
                .foregroundColor(BridalPalette.primaryText)
                .clipShape(Circle())
                .accessibilityLabel("Pass")

                Button {
                    recordCurrentCard(action: .like)
                } label: {
                    Image(systemName: "heart.fill")
                        .font(.title2.weight(.semibold))
                        .frame(width: 62, height: 62)
                }
                .buttonStyle(.borderedProminent)
                .tint(BridalPalette.accent)
                .foregroundColor(BridalPalette.primaryText)
                .clipShape(Circle())
                .accessibilityLabel("Love")
            }
            .padding(.bottom, 28)
        }
        .padding(.horizontal, 20)
    }

    private var emptyPortfolioView: some View {
        VStack(spacing: 16) {
            Text("No portfolio photos available yet")
                .font(.system(.title3, design: .serif).weight(.semibold))
                .foregroundColor(BridalPalette.primaryText)

            if let loadError {
                Text(loadError)
                    .font(.system(.body, design: .serif))
                    .foregroundColor(BridalPalette.secondaryText)
                    .multilineTextAlignment(.center)
            }

            Button("Done") {
                onDismiss?()
            }
            .buttonStyle(.borderedProminent)
            .tint(BridalPalette.accent)
            .foregroundColor(BridalPalette.primaryText)
        }
        .padding(24)
        .frame(maxWidth: 360)
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("Choose Your Bridal Edit")
                .font(.title2.weight(.semibold))
                .foregroundColor(BridalPalette.primaryText)

            VStack(spacing: 3) {
                Text("Swipe left if it isn't your style.")
                Text("Swipe right if you're drawn to it.")
                Text("Swipe up if it's exactly the look you're hoping for.")
            }
            .font(.footnote)
            .foregroundColor(BridalPalette.secondaryText)
            .multilineTextAlignment(.center)
        }
        .padding(.top, 56)
    }

    private var resultsView: some View {
        let profile = BeautyProfile(
            likedCards: likedCards,
            superLikedCards: superLikedCards,
            dislikedCards: dislikedCards,
            acceptedTags: acceptedTags,
            rejectedTags: rejectedTags,
            swipeProfile: swipeProfile
        )

        return ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack {
                    Text("Your Bridal Direction")
                        .font(.system(.largeTitle, design: .serif).weight(.semibold))
                        .foregroundColor(BridalPalette.primaryText)

                    Spacer()

                    Button("Done") {
                        onDismiss?()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(BridalPalette.accent)
                    .foregroundColor(BridalPalette.primaryText)
                }

                Text(profile.description)
                    .font(.system(.body, design: .serif))
                    .lineSpacing(5)
                    .foregroundColor(BridalPalette.primaryText)

                if profile.strongestCues.isEmpty == false {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Your strongest cues:")
                            .font(.caption.weight(.semibold))
                            .tracking(1.4)
                            .textCase(.uppercase)
                            .foregroundColor(BridalPalette.secondaryText)

                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(profile.strongestCues, id: \.self) { cue in
                                Text("• \(cue)")
                                    .font(.system(.body, design: .serif))
                                    .foregroundColor(BridalPalette.primaryText)
                            }
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(BridalPalette.surface.opacity(0.72))
                    .cornerRadius(8)
                }

                if profile.hasStrongPull {
                    SwipeExplanationSection(title: "Strong pull toward:", items: profile.strongPullToward)
                } else if profile.hasLeaning {
                    SwipeExplanationSection(title: "Leaning toward:", items: profile.leaningToward)
                }

                if profile.hasStrongDislikes {
                    SwipeExplanationSection(title: "Consistently passed on:", items: profile.consistentlyPassedOn)
                }

                SwipeExplanationSection(title: "I'm drawn to", items: profile.drawnTo)
                SwipeExplanationSection(title: "I'd rather avoid", items: profile.ratherAvoid)
                SwipeExplanationSection(title: "Details I keep choosing", items: profile.detailsKeptChoosing)

                if isAuthenticated {
                    VStack(spacing: 8) {
                        Button {
                            saveBridalDirection(profile)
                        } label: {
                            if isSavingBridalDirection {
                                ProgressView()
                                    .tint(BridalPalette.primaryText)
                                    .frame(maxWidth: .infinity)
                            } else {
                                Text(hasSavedBridalDirection ? "SAVED TO PROFILE" : "SAVE TO PROFILE")
                                    .font(.caption.weight(.semibold))
                                    .tracking(1.8)
                                    .textCase(.uppercase)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(BridalPalette.accent)
                        .foregroundColor(BridalPalette.primaryText)
                        .disabled(isSavingBridalDirection)

                        if let saveBridalDirectionError {
                            Text(saveBridalDirectionError)
                                .font(.footnote)
                                .foregroundColor(.red)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .padding(.top, 8)
                }

                Button("Start Over") {
                    resetDeck()
                }
                .buttonStyle(.bordered)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 8)
            }
            .padding(24)
            .background(BridalPalette.blush)
            .cornerRadius(8)
            .padding(20)
        }
        .background(BridalPalette.background)
    }

    private var visibleCards: [SwipeCard] {
        Array(cards.dropFirst(currentIndex).filter { !failedImageCardIDs.contains($0.id) }.prefix(3))
    }

    private func recordCurrentCard(action: SwipeAction) {
        advancePastFailedCards()
        guard currentIndex < cards.count else { return }

        let card = cards[currentIndex]

        switch action {
        case .like:
            likedCards.append(card)
            for tag in card.tags {
                acceptedTags[tag.style, default: 0] += tag.weight
            }
        case .superLike:
            superLikedCards.append(card)
            for tag in card.tags {
                acceptedTags[tag.style, default: 0] += tag.weight * SwipeAction.superLikeWeightMultiplier
            }
        case .dislike:
            dislikedCards.append(card)
            for tag in card.tags {
                rejectedTags[tag.style, default: 0] += tag.weight
            }
        }

        swipeProfile.register(card: card, action: action)
        logSwipe(card: card, action: action)
        hasSavedBridalDirection = false
        saveBridalDirectionError = nil

        let nextIndex = currentIndex + 1
        if nextIndex >= cards.count {
            logFinalPreferenceSummary()
            if isAuthenticated {
                showResults = true
            } else {
                showAccountGate = true
            }
        } else {
            currentIndex = nextIndex
            preloadUpcomingPhotos(from: currentIndex, count: 3)
        }
    }

    private func resetDeck() {
        let previousLikeCount = likedCards.count
        let previousSuperLikeCount = superLikedCards.count
        let previousDislikeCount = dislikedCards.count
        let hadGeneratedLanguage = showResults
        cards = Self.shuffled(baseSessionCards)
        currentIndex = 0
        likedCards = []
        superLikedCards = []
        dislikedCards = []
        acceptedTags = [:]
        rejectedTags = [:]
        swipeProfile = SwipeProfile()
        showResults = false
        failedImageCardIDs = []
        preloadedImageURLs = []
        isSavingBridalDirection = false
        hasSavedBridalDirection = false
        saveBridalDirectionError = nil
        print("SWIPE PREFERENCE RESET", [
            "cleared_likes": previousLikeCount,
            "cleared_super_likes": previousSuperLikeCount,
            "cleared_dislikes": previousDislikeCount,
            "cleared_generated_language": hadGeneratedLanguage
        ] as [String : Any])
        preloadUpcomingPhotos(from: 0, count: 5)
    }

    private func saveBridalDirection(_ profile: BeautyProfile) {
        guard isSavingBridalDirection == false else { return }
        guard let authenticatedUserID, authenticatedUserID.isEmpty == false,
              let authenticatedAccessToken, authenticatedAccessToken.isEmpty == false else {
            let message = "Missing authenticated user ID or access token."
            print("BRIDAL DIRECTION SAVE FAILURE", message)
            saveBridalDirectionError = message
            return
        }

        let record = BridalDirectionRecord(
            userID: authenticatedUserID,
            primaryArchetype: nil,
            secondaryArchetype: nil,
            summary: profile.description,
            strongestPulls: profile.strongPullToward,
            passedOn: profile.consistentlyPassedOn,
            drawnTo: profile.drawnTo,
            ratherAvoid: profile.ratherAvoid,
            detailsKeepChoosing: profile.detailsKeptChoosing
        )

        print("BRIDAL DIRECTION SAVE AUTHENTICATED USER ID", authenticatedUserID)
        print("BRIDAL DIRECTION SAVE AUTH UID FROM JWT", BridalDirectionService.authUID(from: authenticatedAccessToken) ?? "(unavailable)")
        print("BRIDAL DIRECTION SAVE USER ID MATCHES AUTH UID", BridalDirectionService.authUID(from: authenticatedAccessToken) == authenticatedUserID)
        print("BRIDAL DIRECTION SAVE TABLE", "public.bridal_directions")
        print("BRIDAL DIRECTION SAVE JSON PAYLOAD", BridalDirectionService.payloadDebugString(for: record))

        isSavingBridalDirection = true
        saveBridalDirectionError = nil

        Task {
            do {
                let returnedRow = try await BridalDirectionService.upsert(record, accessToken: authenticatedAccessToken)
                print("BRIDAL DIRECTION SAVE SUCCESS")
                print("BRIDAL DIRECTION SAVE RETURNED ROW", returnedRow)

                await MainActor.run {
                    hasSavedBridalDirection = true
                    saveBridalDirectionError = nil
                    isSavingBridalDirection = false
                }
            } catch {
                print("BRIDAL DIRECTION SAVE FAILURE")
                print("BRIDAL DIRECTION SAVE FULL ERROR", String(describing: error))
                if let postgRESTError = error as? PostgRESTError {
                    print("BRIDAL DIRECTION POSTGREST MESSAGE", postgRESTError.message)
                    print("BRIDAL DIRECTION POSTGREST DETAILS", postgRESTError.details ?? "(none)")
                    print("BRIDAL DIRECTION POSTGREST HINT", postgRESTError.hint ?? "(none)")
                    print("BRIDAL DIRECTION POSTGREST CODE", postgRESTError.code ?? "(none)")
                }
                await MainActor.run {
                    hasSavedBridalDirection = false
                    saveBridalDirectionError = BridalDirectionService.displayMessage(for: error)
                    isSavingBridalDirection = false
                }
            }
        }
    }

    @MainActor
    private func loadPortfolioCards() async {
        guard !hasLoadedSessionCards else { return }
        guard !isLoadingCards else { return }
        isLoadingCards = true
        loadError = nil
        print("ORIGINAL SWIPE CARDS", SwipeCard.bridalBeautyDeck.count)

        do {
            let portfolioCards = try await ArtistPortfolioService.fetchPortfolioCards()
            print("PORTFOLIO SWIPE CARDS", portfolioCards.count)
            let combinedCards = Self.combinedCards(existingCards: SwipeCard.bridalBeautyDeck, portfolioCards: portfolioCards)
            let shuffledCards = Self.shuffled(combinedCards)
            print("COMBINED SWIPE CARDS", combinedCards.count)
            print("SHUFFLED SWIPE SESSION CARDS", shuffledCards.count)
            baseSessionCards = combinedCards
            cards = shuffledCards
            currentIndex = 0
            likedCards = []
            superLikedCards = []
            dislikedCards = []
            acceptedTags = [:]
            rejectedTags = [:]
            swipeProfile = SwipeProfile()
            showResults = false
            failedImageCardIDs = []
            preloadedImageURLs = []
            isSavingBridalDirection = false
            hasSavedBridalDirection = false
            saveBridalDirectionError = nil
            hasLoadedSessionCards = true
            preloadUpcomingPhotos(from: 0, count: 5)
        } catch {
            print("Portfolio photo load failed: \(error)")
            print("COMBINED SWIPE CARDS", SwipeCard.bridalBeautyDeck.count)
            baseSessionCards = SwipeCard.bridalBeautyDeck
            cards = Self.shuffled(SwipeCard.bridalBeautyDeck)
            currentIndex = 0
            likedCards = []
            superLikedCards = []
            dislikedCards = []
            acceptedTags = [:]
            rejectedTags = [:]
            swipeProfile = SwipeProfile()
            showResults = false
            failedImageCardIDs = []
            preloadedImageURLs = []
            isSavingBridalDirection = false
            hasSavedBridalDirection = false
            saveBridalDirectionError = nil
            hasLoadedSessionCards = true
            preloadUpcomingPhotos(from: 0, count: 5)
        }

        isLoadingCards = false
    }

    private static func combinedCards(existingCards: [SwipeCard], portfolioCards: [SwipeCard]) -> [SwipeCard] {
        var seenImageURLs = Set<String>()
        let uniquePortfolioCards = portfolioCards.filter { card in
            guard let imageURL = card.imageURL, !imageURL.isEmpty else { return false }
            return seenImageURLs.insert(imageURL).inserted
        }
        return existingCards + uniquePortfolioCards
    }

    private static func shuffled(_ input: [SwipeCard]) -> [SwipeCard] {
        guard input.count > 1 else { return input }
        return input
            .map { card -> (card: SwipeCard, key: Double) in
                let boost: Double = card.isFeaturedArtist ? 0.15 : (card.isUpgradedArtist ? 0.08 : 0)
                return (card, Double.random(in: 0..<1) - boost)
            }
            .sorted { $0.key < $1.key }
            .map { $0.card }
    }

    private func preloadUpcomingPhotos(from startIndex: Int, count: Int) {
        let upcoming = cards.dropFirst(startIndex).filter { !failedImageCardIDs.contains($0.id) }.prefix(count)
        for card in upcoming {
            guard let imageURL = card.imageURL,
                  !imageURL.isEmpty,
                  preloadedImageURLs.contains(imageURL) == false,
                  let url = URL(string: imageURL) else { continue }
            preloadedImageURLs.insert(imageURL)
            print("SWIPE PHOTO PRELOAD START", imageURL)
            Task.detached {
                do {
                    let (data, _) = try await URLSession.shared.data(from: url)
                    if UIImage(data: data) != nil {
                        print("SWIPE PHOTO LOAD SUCCESS", imageURL)
                    } else {
                        print("SWIPE PHOTO LOAD FAILURE invalid image", imageURL)
                    }
                } catch {
                    print("SWIPE PHOTO LOAD FAILURE", imageURL, error.localizedDescription)
                }
            }
        }
    }

    private func handleImageFailure(_ card: SwipeCard) {
        guard failedImageCardIDs.contains(card.id) == false else { return }
        print("SWIPE PHOTO CARD FAILURE SKIPPING", card.imageURL ?? card.assetName)
        failedImageCardIDs.insert(card.id)
        if currentIndex < cards.count, cards[currentIndex].id == card.id {
            currentIndex += 1
            advancePastFailedCards()
            if currentIndex >= cards.count {
                showResults = true
            } else {
                preloadUpcomingPhotos(from: currentIndex, count: 3)
            }
        }
    }

    private func advancePastFailedCards() {
        while currentIndex < cards.count, failedImageCardIDs.contains(cards[currentIndex].id) {
            currentIndex += 1
        }
    }

    private func logSwipe(card: SwipeCard, action: SwipeAction) {
        print("SWIPE PREFERENCE ACTION", [
            "image_id": card.id,
            "action": action.rawValue,
            "descriptive_tags_applied": card.preferenceTags.map(\.label),
            "preference_weight_multiplier": action.preferenceWeightMultiplier,
            "running_tag_totals": swipeProfile.rankedTagScores,
            "excluded_or_negatively_weighted_tags": swipeProfile.excludedOrNegativeTags
        ] as [String : Any])
    }

    private func logFinalPreferenceSummary() {
        let profile = BeautyProfile(
            likedCards: likedCards,
            superLikedCards: superLikedCards,
            dislikedCards: dislikedCards,
            acceptedTags: acceptedTags,
            rejectedTags: rejectedTags,
            swipeProfile: swipeProfile
        )
        print("SWIPE PREFERENCE FINAL", [
            "final_ranked_preference_tags": swipeProfile.rankedTagScores,
            "excluded_or_negatively_weighted_tags": swipeProfile.excludedOrNegativeTags,
            "generated_summary": profile.description
        ] as [String : Any])
        onPreferenceUpdate?(profile.preferencePayload)
    }
}

enum SwipeAction: String {
    case like
    case superLike = "super_like"
    case dislike

    static let superLikeWeightMultiplier = 2

    var preferenceWeightMultiplier: Int {
        switch self {
        case .superLike:
            return Self.superLikeWeightMultiplier
        case .like, .dislike:
            return 1
        }
    }
}

struct SwipePreferencePayload: Encodable {
    let summary: String
    let drawnTo: [String]
    let ratherAvoid: [String]
    let detailsKeptChoosing: [String]
    let hairPreferences: [String]
    let makeupPreferences: [String]
    let finish: [String]
    let structure: [String]
    let details: [String]
    let otherRecurringThemes: [String]
    let talkingPoints: [String]
    let rankedPreferenceTags: [String]
    let negativePreferenceTags: [String]
    let likedImageIDs: [String]
    let superLikedImageIDs: [String]
    let dislikedImageIDs: [String]
    let updatedAt: String
}

private struct BridalDirectionRecord: Encodable {
    let userID: String
    let primaryArchetype: String?
    let secondaryArchetype: String?
    let summary: String
    let strongestPulls: [String]
    let passedOn: [String]
    let drawnTo: [String]
    let ratherAvoid: [String]
    let detailsKeepChoosing: [String]

    enum CodingKeys: String, CodingKey {
        case userID = "user_id"
        case primaryArchetype = "primary_archetype"
        case secondaryArchetype = "secondary_archetype"
        case summary
        case strongestPulls = "strongest_pulls"
        case passedOn = "passed_on"
        case drawnTo = "drawn_to"
        case ratherAvoid = "rather_avoid"
        case detailsKeepChoosing = "details_keep_choosing"
    }
}

private enum BridalDirectionService {
    private static let supabaseURL = URL(string: "https://wrkbkkbxkwawoabqfdeg.supabase.co")!
    private static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indya2Jra2J4a3dhd29hYnFmZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzI0MjcsImV4cCI6MjA5Mzc0ODQyN30.h7s2e-OiwmQEnJgbS0rLAbWDmv_nEEy8qTmKfTFWRPI"

    static func upsert(_ record: BridalDirectionRecord, accessToken: String) async throws -> String {
        var components = URLComponents(url: supabaseURL.appendingPathComponent("rest/v1/bridal_directions"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "on_conflict", value: "user_id")]

        guard let url = components.url else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("public", forHTTPHeaderField: "Content-Profile")
        request.setValue("public", forHTTPHeaderField: "Accept-Profile")
        request.setValue("resolution=merge-duplicates,return=representation", forHTTPHeaderField: "Prefer")
        request.httpBody = try JSONEncoder().encode(record)

        print("BRIDAL DIRECTION UPSERT REQUEST", [
            "schema": "public",
            "table": "bridal_directions",
            "onConflict": "user_id",
            "url": url.absoluteString,
            "method": request.httpMethod ?? ""
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let rawBody = String(data: data, encoding: .utf8) ?? "<non-utf8 response>"
        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            let statusCode = (response as? HTTPURLResponse)?.statusCode
            print("BRIDAL DIRECTION UPSERT HTTP FAILURE", [
                "status": statusCode as Any,
                "body": rawBody
            ])
            throw PostgRESTError.from(data: data, statusCode: statusCode)
        }

        print("BRIDAL DIRECTION UPSERT HTTP SUCCESS", [
            "status": httpResponse.statusCode,
            "body": rawBody
        ])
        return rawBody
    }

    static func payloadDebugString(for record: BridalDirectionRecord) -> String {
        do {
            let data = try JSONEncoder().encode(record)
            return String(data: data, encoding: .utf8) ?? "<non-utf8 payload>"
        } catch {
            return "<payload encoding failed: \(error)>"
        }
    }

    static func displayMessage(for error: Error) -> String {
        if let postgRESTError = error as? PostgRESTError {
            return postgRESTError.fullDisplayMessage
        }
        return error.localizedDescription
    }

    static func authUID(from accessToken: String) -> String? {
        let parts = accessToken.split(separator: ".")
        guard parts.count >= 2 else { return nil }

        var payload = String(parts[1])
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while payload.count % 4 != 0 {
            payload.append("=")
        }

        guard let data = Data(base64Encoded: payload),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        return json["sub"] as? String
    }
}

private struct PostgRESTError: Error, CustomStringConvertible {
    let message: String
    let details: String?
    let hint: String?
    let code: String?
    let statusCode: Int?
    let rawBody: String

    var description: String {
        [
            "status=\(statusCode.map(String.init) ?? "(none)")",
            "message=\(message)",
            "details=\(details ?? "(none)")",
            "hint=\(hint ?? "(none)")",
            "code=\(code ?? "(none)")",
            "rawBody=\(rawBody)"
        ].joined(separator: " | ")
    }

    var fullDisplayMessage: String {
        [
            message,
            details.map { "Details: \($0)" },
            hint.map { "Hint: \($0)" },
            code.map { "Code: \($0)" }
        ]
        .compactMap { $0 }
        .joined(separator: "\n")
    }

    static func from(data: Data, statusCode: Int?) -> PostgRESTError {
        let rawBody = String(data: data, encoding: .utf8) ?? "<non-utf8 response>"
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return PostgRESTError(
            message: json?["message"] as? String ?? rawBody,
            details: json?["details"] as? String,
            hint: json?["hint"] as? String,
            code: json?["code"] as? String,
            statusCode: statusCode,
            rawBody: rawBody
        )
    }
}

private struct SwipeCardView: View {
    let card: SwipeCard
    let cardSize: CGSize
    let isTopCard: Bool
    let onSwipe: (SwipeAction) -> Void
    let onImageFailure: (SwipeCard) -> Void

    @State private var dragOffset: CGSize = .zero
    @State private var isLeaving = false
    @State private var showSuperLikeBurst = false

    private var decisionOpacity: Double {
        min(1, max(abs(dragOffset.width), max(0, -dragOffset.height)) / 90)
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                guard isTopCard, !isLeaving else { return }
                dragOffset = value.translation
            }
            .onEnded { value in
                guard isTopCard, !isLeaving else { return }

                if isSuperLikeGesture(value.translation) {
                    leave(action: .superLike)
                } else if value.translation.width > 90 {
                    leave(action: .like)
                } else if value.translation.width < -90 {
                    leave(action: .dislike)
                } else {
                    dragOffset = .zero
                }
            }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            cardImage
                .frame(width: cardSize.width, height: cardSize.height)
                .clipped()
                .cornerRadius(10)
                .background(BridalPalette.surface)
                .shadow(color: .black.opacity(0.12), radius: 18, y: 10)

            decisionBadge
            superLikeBurst
        }
        .contentShape(Rectangle())
        .offset(dragOffset)
        .rotationEffect(.degrees(Double(dragOffset.width / 18)))
        .gesture(dragGesture)
        .animation(.spring(response: 0.25, dampingFraction: 0.7), value: dragOffset)
        .animation(.spring(response: 0.22, dampingFraction: 0.62), value: showSuperLikeBurst)
    }

    @ViewBuilder
    private var cardImage: some View {
        if let imageURL = card.imageURL, let url = URL(string: imageURL) {
            AsyncImage(url: url) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: cardSize.width, height: cardSize.height)
                        .clipped()
                        .onAppear {
                            print("SWIPE CARD IMAGE LOAD SUCCESS", [
                                "photo_id": card.id,
                                "final_src": imageURL
                            ])
                        }
                case .failure:
                    placeholderImage
                        .frame(width: cardSize.width, height: cardSize.height)
                        .clipped()
                        .onAppear {
                            print("SWIPE CARD IMAGE LOAD ERROR", [
                                "photo_id": card.id,
                                "final_src": imageURL,
                                "error_event": "AsyncImage.failure"
                            ])
                            onImageFailure(card)
                        }
                case .empty:
                    ZStack {
                        placeholderImage
                        ProgressView()
                            .tint(BridalPalette.accent)
                    }
                    .frame(width: cardSize.width, height: cardSize.height)
                    .clipped()
                @unknown default:
                    placeholderImage
                        .frame(width: cardSize.width, height: cardSize.height)
                        .clipped()
                }
            }
        } else {
            Image(card.assetName)
                .resizable()
                .scaledToFill()
                .frame(width: cardSize.width, height: cardSize.height)
                .clipped()
        }
    }

    private var placeholderImage: some View {
        ZStack {
            BridalPalette.blush
            VStack(spacing: 8) {
                Text("Portfolio photo")
                    .font(.caption.weight(.semibold))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundColor(BridalPalette.secondaryText)

                if let imageURL = card.imageURL, imageURL.isEmpty == false {
                    Text(imageURL)
                        .font(.caption2)
                        .foregroundColor(BridalPalette.secondaryText.opacity(0.75))
                        .multilineTextAlignment(.center)
                        .lineLimit(4)
                        .padding(.horizontal, 18)
                }
            }
        }
    }

    private var decisionBadge: some View {
        if isUpwardDrag {
            return AnyView(
                Text("LOVE")
                    .font(.caption.weight(.bold))
                    .tracking(1.8)
                    .foregroundColor(BridalPalette.primaryText)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(BridalPalette.accent)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(BridalPalette.hairline, lineWidth: 1)
                    )
                    .cornerRadius(8)
                    .opacity(decisionOpacity)
                    .padding(26)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            )
        }

        let isYes = dragOffset.width >= 0

        return AnyView(
            Text(isYes ? "YES" : "NO")
                .font(.caption.weight(.bold))
                .tracking(1.8)
                .foregroundColor(BridalPalette.primaryText)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(isYes ? BridalPalette.accent : BridalPalette.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(BridalPalette.hairline, lineWidth: 1)
                )
                .cornerRadius(8)
                .opacity(decisionOpacity)
                .padding(26)
                .rotationEffect(.degrees(isYes ? -8 : 8))
                .frame(maxWidth: .infinity, alignment: isYes ? .topLeading : .topTrailing)
        )
    }

    @ViewBuilder
    private var superLikeBurst: some View {
        if showSuperLikeBurst {
            ZStack {
                Image(systemName: "star.fill")
                    .font(.system(size: 72, weight: .bold))
                    .foregroundColor(BridalPalette.accent)
                    .shadow(color: BridalPalette.primaryText.opacity(0.18), radius: 12, y: 4)

                ForEach(0..<6, id: \.self) { index in
                    Image(systemName: "sparkle")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(BridalPalette.accent)
                        .offset(
                            x: cos(CGFloat(index) * .pi / 3) * 76,
                            y: sin(CGFloat(index) * .pi / 3) * 76
                        )
                }
            }
            .scaleEffect(showSuperLikeBurst ? 1 : 0.4)
            .opacity(showSuperLikeBurst ? 1 : 0)
            .frame(width: cardSize.width, height: cardSize.height)
            .allowsHitTesting(false)
        }
    }

    private var isUpwardDrag: Bool {
        dragOffset.height < -60 && abs(dragOffset.height) > abs(dragOffset.width) * 1.15
    }

    private func isSuperLikeGesture(_ translation: CGSize) -> Bool {
        translation.height < -110 && abs(translation.height) > abs(translation.width) * 1.15
    }

    private func leave(action: SwipeAction) {
        isLeaving = true
        triggerHaptics(for: action)

        if action == .superLike {
            showSuperLikeBurst = true
        }

        withAnimation(.spring(response: 0.28, dampingFraction: 0.72)) {
            switch action {
            case .like:
                dragOffset = CGSize(width: 620, height: dragOffset.height * 0.35)
            case .dislike:
                dragOffset = CGSize(width: -620, height: dragOffset.height * 0.35)
            case .superLike:
                dragOffset = CGSize(width: dragOffset.width * 0.15, height: -760)
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + (action == .superLike ? 0.24 : 0.18)) {
            onSwipe(action)
            dragOffset = .zero
            isLeaving = false
            showSuperLikeBurst = false
        }
    }

    private func triggerHaptics(for action: SwipeAction) {
        switch action {
        case .superLike:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred(intensity: 0.9)
        case .like:
            UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.55)
        case .dislike:
            UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 0.45)
        }
    }
}

private struct SwipeExplanationSection: View {
    let title: String
    let items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundColor(BridalPalette.secondaryText)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(items, id: \.self) { item in
                    Text("• \(item)")
                        .font(.system(.body, design: .serif))
                        .foregroundColor(BridalPalette.primaryText)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BridalPalette.surface.opacity(0.72))
        .cornerRadius(8)
    }
}

private struct ResultRecommendationView: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption.weight(.semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundColor(BridalPalette.secondaryText)

            Text(text)
                .font(.system(.body, design: .serif))
                .lineSpacing(4)
                .foregroundColor(BridalPalette.primaryText)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BridalPalette.surface.opacity(0.72))
        .cornerRadius(8)
    }
}

enum AccountGateMode: String {
    case results
    case general

    var title: String {
        switch self {
        case .results:
            return "Your results are ready."
        case .general:
            return "Create your account to continue."
        }
    }

    var bodyText: String {
        switch self {
        case .results:
            return "Create your free account to unlock your bridal beauty results, save your archetype, explore artists, and build your wedding beauty plan."
        case .general:
            return "The Bridal Edit works best when your beauty preferences, saved artists, timeline, and recommendations live in one place."
        }
    }

    var smallText: String {
        switch self {
        case .results:
            return "Your account keeps your results, saved artists, and timeline in one place."
        case .general:
            return "It only takes a minute."
        }
    }
}

private struct AccountGateView: View {
    let mode: AccountGateMode
    let onCreateAccount: () -> Void
    let onSignIn: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(mode.title)
                .font(.system(.title, design: .serif).weight(.semibold))
                .foregroundColor(BridalPalette.primaryText)

            Text(mode.bodyText)
                .font(.system(.body, design: .serif))
                .lineSpacing(5)
                .foregroundColor(BridalPalette.primaryText)

            VStack(spacing: 10) {
                Button("Create Free Account") {
                    onCreateAccount()
                }
                .buttonStyle(AccountGateButtonStyle(isPrimary: true))

                Button("Sign In") {
                    onSignIn()
                }
                .buttonStyle(AccountGateButtonStyle(isPrimary: false))
            }
            .padding(.top, 4)

            Text(mode.smallText)
                .font(.system(.footnote, design: .serif).italic())
                .foregroundColor(BridalPalette.secondaryText)
        }
        .padding(24)
        .background(BridalPalette.surface)
    }
}

private struct AccountGateButtonStyle: ButtonStyle {
    let isPrimary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.semibold))
            .textCase(.uppercase)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(isPrimary ? BridalPalette.primaryText : BridalPalette.surface)
            .foregroundColor(isPrimary ? BridalPalette.surface : BridalPalette.primaryText)
            .overlay(
                Rectangle()
                    .stroke(BridalPalette.primaryText, lineWidth: 0.5)
            )
            .opacity(configuration.isPressed ? 0.72 : 1)
    }
}

struct PreferenceTag: Equatable {
    let label: String
    let group: String
    let weight: Int

    init(_ label: String, group: String, weight: Int = 2) {
        self.label = label
        self.group = group
        self.weight = weight
    }
}

struct SwipeProfile: Equatable {
    var tagScores: [String: Int] = [:]
    var tagGroups: [String: String] = [:]
    var likedImageIDs: [String] = []
    var superLikedImageIDs: [String] = []
    var dislikedImageIDs: [String] = []

    mutating func register(card: SwipeCard, action: SwipeAction) {
        switch action {
        case .like:
            likedImageIDs.append(card.id)
            apply(card.preferenceTags, sign: 1)
        case .superLike:
            superLikedImageIDs.append(card.id)
            apply(card.preferenceTags, sign: SwipeAction.superLikeWeightMultiplier)
        case .dislike:
            dislikedImageIDs.append(card.id)
            apply(card.preferenceTags, sign: -1)
        }
    }

    private mutating func apply(_ preferenceTags: [PreferenceTag], sign: Int) {
        for tag in preferenceTags {
            tagScores[tag.label, default: 0] += tag.weight * sign
            tagGroups[tag.label] = tag.group
        }
    }

    var allEntries: [(label: String, group: String, score: Int)] {
        tagScores.map { key, value in
            (label: key, group: tagGroups[key] ?? "detail", score: value)
        }
    }

    var positiveEntries: [(label: String, group: String, score: Int)] {
        allEntries
            .filter { $0.score > 0 }
            .sorted { $0.score == $1.score ? $0.label < $1.label : $0.score > $1.score }
    }

    var negativeEntries: [(label: String, group: String, score: Int)] {
        allEntries
            .filter { $0.score < 0 }
            .sorted { $0.score == $1.score ? $0.label < $1.label : $0.score < $1.score }
    }

    var rankedTagScores: [String] {
        allEntries
            .sorted { $0.score == $1.score ? $0.label < $1.label : $0.score > $1.score }
            .map { "\(Self.displayLabel($0.label)): \($0.score)" }
    }

    var excludedOrNegativeTags: [String] {
        negativeEntries.map { "\(Self.displayLabel($0.label)): \($0.score)" }
    }

    var strongPullToward: [String] {
        positiveEntries.prefix(6).map { Self.displayLabel($0.label) }
    }

    var leaningToward: [String] {
        positiveEntries.dropFirst(6).prefix(4).map { Self.displayLabel($0.label) }
    }

    var consistentlyPassedOn: [String] {
        negativeEntries.prefix(6).map { Self.displayLabel($0.label) }
    }

    var isEmpty: Bool {
        tagScores.isEmpty
    }

    func topLabel(in groups: Set<String>) -> String? {
        positiveEntries.first { groups.contains($0.group) }?.label
    }

    func topLabels(in groups: Set<String>, limit: Int) -> [String] {
        Array(positiveEntries.filter { groups.contains($0.group) }.prefix(limit).map(\.label))
    }

    static func displayLabel(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "_")
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined(separator: " ")
    }
}

private struct BeautyProfile {
    let likedCards: [SwipeCard]
    let superLikedCards: [SwipeCard]
    let dislikedCards: [SwipeCard]
    let acceptedTags: [BridalStyle: Int]
    let rejectedTags: [BridalStyle: Int]
    let swipeProfile: SwipeProfile

    private var scores: [BridalStyle: Int] {
        acceptedTags.reduce(into: rejectedTags.mapValues { -$0 }) { result, entry in
            result[entry.key, default: 0] += entry.value
        }
    }

    private var preferredStyles: [BridalStyle] {
        acceptedTags
            .sorted {
                if $0.value == $1.value {
                    return $0.key.displayName < $1.key.displayName
                }

                return $0.value > $1.value
            }
            .prefix(4)
            .map(\.key)
    }

    private var topStyles: [BridalStyle] {
        scores
            .sorted {
                if $0.value == $1.value {
                    return $0.key.displayName < $1.key.displayName
                }

                return $0.value > $1.value
            }
            .prefix(4)
            .map(\.key)
    }

    var strongestCues: [String] {
        swipeProfile.strongPullToward
    }

    var description: String {
        guard likedCards.isEmpty == false || superLikedCards.isEmpty == false else {
            return "Your swipes did not create a clear preference brief yet. Try the deck again and only choose references that feel immediately right."
        }

        return "You're consistently drawn to \(hairSummary). In makeup, you prefer \(makeupSummary). \(detailSummary)"
    }

    var drawnTo: [String] {
        let items = swipeProfile.positiveEntries.prefix(7).map { phrase(for: $0.label) }
        return items.isEmpty ? ["References that feel immediately right, separate from the quiz archetype."] : items
    }

    var ratherAvoid: [String] {
        let items = swipeProfile.negativeEntries.prefix(6).map { phrase(for: $0.label) }
        return items.isEmpty ? ["Nothing showed up as a strong avoid yet."] : items
    }

    var detailsKeptChoosing: [String] {
        let detailGroups: Set<String> = ["face", "placement", "accessory", "volume", "parting", "silhouette", "tone", "detail_style"]
        let items = swipeProfile.topLabels(in: detailGroups, limit: 7).map { phrase(for: $0) }
        return items.isEmpty ? swipeProfile.strongPullToward : items
    }

    var hairPreferences: [String] {
        labels(in: ["hair_structure", "hair_finish", "placement", "face", "volume", "parting", "silhouette"], limit: 6)
    }

    var makeupPreferences: [String] {
        labels(in: ["eyes", "makeup_intensity", "skin_finish", "tone"], limit: 6)
    }

    var finishPreferences: [String] {
        labels(in: ["hair_finish", "skin_finish"], limit: 5)
    }

    var structurePreferences: [String] {
        labels(in: ["hair_structure", "placement", "face", "volume", "silhouette"], limit: 5)
    }

    var detailPreferences: [String] {
        labels(in: ["detail_style", "accessory", "parting"], limit: 5)
    }

    var otherRecurringThemes: [String] {
        let coveredGroups: Set<String> = ["hair_structure", "hair_finish", "placement", "face", "volume", "parting", "silhouette", "eyes", "makeup_intensity", "skin_finish", "tone", "detail_style", "accessory"]
        let items = swipeProfile.positiveEntries
            .filter { coveredGroups.contains($0.group) == false }
            .prefix(5)
            .map { phrase(for: $0.label) }
        return items.isEmpty ? Array(drawnTo.dropFirst(3).prefix(4)) : items
    }

    var talkingPoints: [String] {
        [
            "I consistently gravitate toward \(joinPhrases(Array(drawnTo.prefix(3)))).",
            "I usually prefer \(makeupSummary).",
            "I'm less drawn to \(joinPhrases(Array(ratherAvoid.prefix(3)))).",
            "The details I repeatedly choose are \(joinPhrases(Array(detailsKeptChoosing.prefix(3))))."
        ]
    }

    var preferencePayload: SwipePreferencePayload {
        SwipePreferencePayload(
            summary: description,
            drawnTo: drawnTo,
            ratherAvoid: ratherAvoid,
            detailsKeptChoosing: detailsKeptChoosing,
            hairPreferences: hairPreferences,
            makeupPreferences: makeupPreferences,
            finish: finishPreferences,
            structure: structurePreferences,
            details: detailPreferences,
            otherRecurringThemes: otherRecurringThemes,
            talkingPoints: talkingPoints,
            rankedPreferenceTags: swipeProfile.rankedTagScores,
            negativePreferenceTags: swipeProfile.excludedOrNegativeTags,
            likedImageIDs: swipeProfile.likedImageIDs,
            superLikedImageIDs: swipeProfile.superLikedImageIDs,
            dislikedImageIDs: swipeProfile.dislikedImageIDs,
            updatedAt: ISO8601DateFormatter().string(from: Date())
        )
    }

    private var hairSummary: String {
        let structure = phrase(for: swipeProfile.topLabel(in: ["hair_structure"]) ?? "balanced_hair_structure")
        let finish = phrase(for: swipeProfile.topLabel(in: ["hair_finish"]) ?? "polished_finish")
        var pieces = [structure, finish]

        if let placement = swipeProfile.topLabel(in: ["placement"]) {
            pieces.append(phrase(for: placement))
        }
        if let face = swipeProfile.topLabel(in: ["face"]) {
            pieces.append(phrase(for: face))
        }

        return joinPhrases(pieces)
    }

    private var makeupSummary: String {
        let eyes = phrase(for: swipeProfile.topLabel(in: ["eyes"]) ?? "soft_eye_definition")
        let intensity = phrase(for: swipeProfile.topLabel(in: ["makeup_intensity"]) ?? "medium_makeup_intensity")
        let skin = phrase(for: swipeProfile.topLabel(in: ["skin_finish"]) ?? "natural_skin")
        var pieces = [eyes, intensity, skin]

        if let tone = swipeProfile.topLabel(in: ["tone"]) {
            pieces.append(phrase(for: tone))
        }

        return joinPhrases(pieces)
    }

    private var detailSummary: String {
        let detailLabels = swipeProfile.topLabels(in: ["detail_style", "accessory", "volume", "parting", "silhouette"], limit: 3)
        guard detailLabels.isEmpty == false else {
            return "This adds nuance to the quiz archetype without replacing it."
        }
        return "The details that keep repeating are \(joinPhrases(detailLabels.map { phrase(for: $0) }))."
    }

    private func labels(in groups: Set<String>, limit: Int) -> [String] {
        swipeProfile.topLabels(in: groups, limit: limit).map { phrase(for: $0) }
    }

    private func phrase(for label: String) -> String {
        switch label {
        case "smooth_structured_hair": return "smooth, structured hair"
        case "loose_textured_hair": return "loose, textured hair"
        case "balanced_hair_structure": return "balanced hair structure"
        case "smooth_finish": return "a smooth finish"
        case "textured_finish": return "visible texture"
        case "polished_finish": return "a polished finish"
        case "hair_away_from_face": return "hair kept away from the face"
        case "face_framing": return "intentional face-framing"
        case "high_placement": return "higher placement"
        case "low_placement": return "low placement"
        case "half_up_shape": return "a half-up shape"
        case "down_hair": return "hair worn down"
        case "defined_eyes": return "defined eyes"
        case "diffused_eyes": return "diffused eye definition"
        case "soft_eye_definition": return "soft eye definition"
        case "minimal_makeup": return "lighter makeup intensity"
        case "medium_makeup_intensity": return "visible polish without heaviness"
        case "strong_makeup": return "stronger makeup intensity"
        case "matte_skin": return "matte skin"
        case "natural_skin": return "natural skin"
        case "satin_skin": return "satin skin"
        case "luminous_skin": return "luminous skin"
        case "sculpted_skin": return "softly sculpted skin"
        case "neutral_tones": return "neutral tones"
        case "rosy_tones": return "rosy tones"
        case "warm_tones": return "warm tones"
        case "cool_tones": return "cool tones"
        case "deeper_tones": return "deeper tones"
        case "clean_editorial_details": return "clean/editorial details"
        case "romantic_organic_details": return "romantic/organic details"
        case "visible_accessories": return "visible accessories"
        case "minimal_accessories": return "minimal accessories"
        case "controlled_volume": return "controlled volume"
        case "airy_volume": return "airy volume"
        case "center_part": return "a center part"
        case "side_part": return "a side part"
        case "clean_silhouette": return "a clean silhouette"
        case "soft_silhouette": return "a soft silhouette"
        default: return SwipeProfile.displayLabel(label).lowercased()
        }
    }

    private func joinPhrases(_ phrases: [String]) -> String {
        let unique = phrases.reduce(into: [String]()) { result, phrase in
            if result.contains(phrase) == false {
                result.append(phrase)
            }
        }
        guard unique.count > 1 else { return unique.first ?? "a clear bridal direction" }
        return unique.dropLast().joined(separator: ", ") + ", and " + unique.last!
    }

    var hairRecommendation: String {
        if dislikes(.lowStructure) && likes(.structured) {
            return "Choose a clean, controlled hairstyle with edited face-framing and a secure finish. Avoid intentionally messy texture or looseness that could read unfinished."
        }

        if likes(.updo) && likes(.structured) && !dislikes(.updo) {
            return "Choose a sculpted updo or low bun with clean face-framing, controlled volume, and a secure finish. Keep accessories minimal or precise so the silhouette stays refined."
        }

        if likes(.updo) && likes(.soft) && !dislikes(.updo) {
            return "Choose a soft updo with airy face-framing and gentle texture through the crown. It should feel romantic, but still intentionally shaped rather than undone."
        }

        if likes(.waves) && likes(.structured) && !dislikes(.waves) {
            return "Choose polished waves with a defined bend, smooth crown, and clean center or side part. The shape should be controlled enough to read expensive from every angle."
        }

        if likes(.waves) && !dislikes(.waves) {
            return "Choose loose waves with soft movement, edited volume, and face-framing that opens the face. Keep the finish touchable, but not casual."
        }

        return "Choose a clean, balanced hairstyle with intentional face-framing and a silhouette that complements the neckline. Prioritize polish and longevity over trend detail."
    }

    var makeupRecommendation: String {
        if dislikes(.glam) || dislikes(.definedEyes) {
            return "Go for refined, natural makeup with soft definition and perfected skin. Avoid heavy eye references or glam details that make the makeup the first thing people notice."
        }

        if likes(.glam) || likes(.definedEyes) {
            return "Go for soft glam: defined eyes, lifted lashes, sculpted skin, and enough depth to photograph beautifully. Keep the complexion refined so the makeup still feels bridal."
        }

        if likes(.minimal) && likes(.natural) && !dislikes(.minimal) {
            return "Go for elevated natural makeup with perfected skin, soft definition, and restrained glow. The goal is fresh and expensive, not bare."
        }

        if likes(.softFocusSkin) || likes(.polished) {
            return "Go for soft-focus skin, subtle sculpting, and balanced eye definition. This direction gives the face structure while keeping the overall read smooth and timeless."
        }

        return "Go for luminous bridal makeup with refined skin, gentle dimension, and eye definition that supports the face without taking over the look."
    }

    private func likes(_ style: BridalStyle) -> Bool {
        scores[style, default: 0] >= 2
    }

    private func dislikes(_ style: BridalStyle) -> Bool {
        scores[style, default: 0] <= -2
    }

    private func leans(_ style: BridalStyle) -> Bool {
        let score = scores[style, default: 0]
        return score > 0 && score < 2
    }

    var strongPullToward: [String] { swipeProfile.strongPullToward }
    var leaningToward: [String] { swipeProfile.leaningToward }
    var consistentlyPassedOn: [String] { swipeProfile.consistentlyPassedOn }
    var hasStrongPull: Bool { strongPullToward.isEmpty == false }
    var hasLeaning: Bool { leaningToward.isEmpty == false }
    var hasStrongDislikes: Bool { consistentlyPassedOn.isEmpty == false }
}

private enum ArtistPortfolioService {
    private static let supabaseURL = URL(string: "https://wrkbkkbxkwawoabqfdeg.supabase.co")!
    private static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indya2Jra2J4a3dhd29hYnFmZGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzI0MjcsImV4cCI6MjA5Mzc0ODQyN30.h7s2e-OiwmQEnJgbS0rLAbWDmv_nEEy8qTmKfTFWRPI"
    private static let portfolioBucket = "artist-portfolio"

    static func fetchPortfolioCards() async throws -> [SwipeCard] {
        print("PORTFOLIO QUERY START")
        let photoRows: [ArtistPortfolioPhotoRow] = try await fetch(
            path: "artist_portfolio_photos",
            select: "*",
            order: "sort_order.asc",
            extraQueryItems: [
                URLQueryItem(name: "image_url", value: "not.is.null"),
                URLQueryItem(name: "image_url", value: "neq.")
            ]
        )
        print("PORTFOLIO PHOTOS RAW", photoRows)
        if photoRows.isEmpty {
            print("No portfolio photo rows returned.")
            print("Check RLS on artist_portfolio_photos if rows exist in Supabase but this query returns 0.")
        }

        let photos = photoRows.filter { !$0.imageURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        print("PORTFOLIO PHOTOS WITH NON-EMPTY IMAGE_URL", photos.count)
        let artistsByID: [String: PortfolioArtist]
        do {
            artistsByID = try await fetchArtistsByID(Array(Set(photos.map(\.artistID))))
        } catch {
            print("Artist profile lookup failed for portfolio photos: \(error)")
            artistsByID = [:]
        }

        return photos.map { photo in
            let artist = artistsByID[photo.artistID]
            let displayURL = displayURL(for: photo.imageURL)
            print("SWIPE PORTFOLIO PHOTO RENDER OBJECT", [
                "photo_id": photo.id ?? "",
                "artist_id": photo.artistID,
                "image_url": photo.imageURL,
                "final_src": displayURL
            ])

            return SwipeCard(
                id: "portfolio-\(photo.id ?? photo.imageURL)",
                imageURL: displayURL,
                source: "portfolio",
                caption: artist?.artistName.isEmpty == false ? artist!.artistName : "Portfolio Artist",
                editorialCue: "Portfolio",
                location: artist?.location ?? "",
                aesthetic: artist?.aesthetic ?? "",
                category: photo.category,
                lookType: photo.lookType,
                hairLook: photo.hairLook,
                makeupLook: photo.makeupLook,
                rawTags: photo.tags,
                tags: PortfolioArtist.tags(from: photo.tags + [photo.category, photo.lookType, photo.hairLook, photo.makeupLook] + (artist?.specialties ?? []) + [artist?.aesthetic ?? ""]),
                isUpgradedArtist: artist?.isUpgraded ?? false,
                isFeaturedArtist: artist?.isFeatured ?? false
            )
        }
    }

    static func fetchArtists() async throws -> [PortfolioArtist] {
        try await fetchProfileArtists()
    }

    private static func fetchProfileArtists() async throws -> [PortfolioArtist] {
        let select = "id,business_name,owner_name,bio,aesthetic,specialties,best_for,not_ideal_for,starting_price,travels,profile_photo_url,website,email,portfolio_photos,city,state,country,services,tier,is_featured"
        let rows: [ArtistProfileRow] = try await fetch(path: "artist_profiles", select: select, order: "business_name.asc")
        return rows.map { row in
            PortfolioArtist(
                id: row.id,
                businessName: row.businessName,
                profilePhotoURL: row.profilePhotoURL,
                portfolioPhotos: row.portfolioPhotos,
                specialties: row.specialties,
                aesthetic: row.aesthetic,
                bestFor: row.bestFor,
                city: row.city,
                state: row.state,
                country: row.country,
                tier: row.tier,
                isFeatured: row.isFeatured
            )
        }
    }

    private static func fetchArtistsByID(_ ids: [String]) async throws -> [String: PortfolioArtist] {
        guard ids.isEmpty == false else { return [:] }

        let joinedIDs = ids.joined(separator: ",")
        let rows: [ArtistProfileRow] = try await fetch(
            path: "artist_profiles",
            select: "id,business_name,specialties,aesthetic,city,state,country,tier,is_featured",
            order: "business_name.asc",
            filters: ["id": "in.(\(joinedIDs))"]
        )

        let artists = rows.map { row in
            PortfolioArtist(
                id: row.id,
                businessName: row.businessName,
                profilePhotoURL: nil,
                portfolioPhotos: [],
                specialties: row.specialties,
                aesthetic: row.aesthetic,
                bestFor: [],
                city: row.city,
                state: row.state,
                country: row.country,
                tier: row.tier,
                isFeatured: row.isFeatured
            )
        }

        return Dictionary(uniqueKeysWithValues: artists.map { ($0.id, $0) })
    }

    private static func displayURL(for imageURL: String) -> String {
        let trimmedURL = imageURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedURL.lowercased().hasPrefix("http") == false else {
            print("SWIPE DISPLAY URL FULL PUBLIC URL USED DIRECTLY", [
                "original": trimmedURL,
                "final_src": trimmedURL
            ])
            return trimmedURL
        }

        let encodedPath = trimmedURL
            .split(separator: "/")
            .map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")

        let publicURL = "\(supabaseURL.absoluteString)/storage/v1/object/public/\(portfolioBucket)/\(encodedPath)"
        print("SWIPE DISPLAY URL STORAGE PATH RESOLVED", [
            "original": trimmedURL,
            "final_src": publicURL
        ])
        return publicURL
    }

    private static func fetch<T: Decodable>(
        path: String,
        select: String,
        order: String,
        filters: [String: String] = [:],
        extraQueryItems: [URLQueryItem] = []
    ) async throws -> T {
        var components = URLComponents(url: supabaseURL.appendingPathComponent("rest/v1/\(path)"), resolvingAgainstBaseURL: false)!
        var queryItems = [
            URLQueryItem(name: "select", value: select),
            URLQueryItem(name: "order", value: order)
        ]
        queryItems.append(contentsOf: filters.map { URLQueryItem(name: $0.key, value: $0.value) })
        queryItems.append(contentsOf: extraQueryItems)
        components.queryItems = queryItems

        guard let url = components.url else {
            throw URLError(.badURL)
        }

        var request = URLRequest(url: url)
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, 200..<300 ~= httpResponse.statusCode else {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct ArtistPortfolioPhotoRow: Decodable {
    let id: String?
    let artistID: String
    let imageURL: String
    let sortOrder: Int?
    let tags: [String]
    let category: String
    let lookType: String
    let hairLook: String
    let makeupLook: String

    enum CodingKeys: String, CodingKey {
        case id
        case artistID = "artist_id"
        case imageURL = "image_url"
        case sortOrder = "sort_order"
        case tags
        case category
        case lookType = "look_type"
        case hairLook = "hair_look"
        case makeupLook = "makeup_look"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = Self.decodeOptionalID(from: container, forKey: .id)
        artistID = Self.decodeID(from: container, forKey: .artistID)
        imageURL = (try container.decodeIfPresent(String.self, forKey: .imageURL)) ?? ""
        sortOrder = try container.decodeIfPresent(Int.self, forKey: .sortOrder)
        tags = (try? container.decodeIfPresent([String].self, forKey: .tags)) ?? []
        category = (try container.decodeIfPresent(String.self, forKey: .category)) ?? ""
        lookType = (try container.decodeIfPresent(String.self, forKey: .lookType)) ?? ""
        hairLook = (try? container.decodeIfPresent(String.self, forKey: .hairLook)) ?? ""
        makeupLook = (try? container.decodeIfPresent(String.self, forKey: .makeupLook)) ?? ""
    }

    private static func decodeOptionalID(
        from container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) -> String? {
        if let stringID = try? container.decode(String.self, forKey: key) {
            return stringID
        }
        if let intID = try? container.decode(Int.self, forKey: key) {
            return String(intID)
        }
        return nil
    }

    private static func decodeID(
        from container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) -> String {
        decodeOptionalID(from: container, forKey: key) ?? ""
    }
}

private struct PortfolioArtist {
    let id: String
    let businessName: String?
    let profilePhotoURL: String?
    let portfolioPhotos: [String]
    let specialties: [String]
    let aesthetic: String
    let bestFor: [String]
    let city: String
    let state: String
    let country: String
    let tier: String
    let isFeatured: Bool

    var isUpgraded: Bool {
        ["premium", "upgraded"].contains(tier.lowercased())
    }

    var artistName: String {
        businessName ?? ""
    }

    var location: String {
        [city, state, country]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    var swipeCards: [SwipeCard] {
        portfolioPhotos
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .map { photo in
                SwipeCard(
                    id: "\(id)-\(photo)",
                    imageURL: photo,
                    caption: artistName,
                    editorialCue: "Portfolio",
                    location: location,
                    aesthetic: aesthetic,
                    tags: Self.tags(from: specialties + bestFor + [aesthetic])
                )
            }
    }

    static func tags(from values: [String]) -> [StyleTag] {
        let text = values.joined(separator: " ").lowercased()
        var tags: [StyleTag] = []

        func append(_ style: BridalStyle, _ keywords: [String], weight: Int = 2) {
            if keywords.contains(where: { text.contains($0) }) {
                tags.append(.init(style, weight))
            }
        }

        append(.soft, ["soft", "romantic", "glow", "luminous", "dewy"])
        append(.glam, ["glam", "full_glam", "soft_glam", "full glam", "airbrush", "smokey", "smoky_eye"])
        append(.waves, ["wave", "waves", "hollywood_waves", "soft_waves", "boho_waves", "curl"])
        append(.updo, ["updo", "bun", "sleek_bun", "textured_bun", "high_bun", "low_bun", "chignon", "pony", "ponytail"])
        append(.structured, ["structured", "sculpt", "polished", "sleek"])
        append(.editorial, ["editorial", "bold", "fashion"])
        append(.natural, ["natural", "natural_makeup", "natural_curls", "minimal", "skin", "texture"])
        append(.classic, ["classic", "timeless"])
        append(.movement, ["boho", "loose", "movement", "texture", "half_up", "face_framing"])

        return tags.isEmpty ? [.init(.soft, 1), .init(.polished, 1)] : tags
    }
}

private struct ArtistProfileRow: Decodable {
    let id: String
    let businessName: String?
    let profilePhotoURL: String?
    let portfolioPhotos: [String]
    let specialties: [String]
    let aesthetic: String
    let bestFor: [String]
    let city: String
    let state: String
    let country: String
    let tier: String
    let isFeatured: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case businessName = "business_name"
        case profilePhotoURL = "profile_photo_url"
        case portfolioPhotos = "portfolio_photos"
        case specialties
        case aesthetic
        case bestFor = "best_for"
        case city
        case state
        case country
        case tier
        case isFeatured = "is_featured"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = Self.decodeID(from: container)
        businessName = try container.decodeIfPresent(String.self, forKey: .businessName)
        profilePhotoURL = try container.decodeIfPresent(String.self, forKey: .profilePhotoURL)
        portfolioPhotos = (try? container.decodeIfPresent([String].self, forKey: .portfolioPhotos)) ?? []
        specialties = (try? container.decodeIfPresent([String].self, forKey: .specialties)) ?? []
        aesthetic = (try container.decodeIfPresent(String.self, forKey: .aesthetic)) ?? ""
        bestFor = (try? container.decodeIfPresent([String].self, forKey: .bestFor)) ?? []
        city = (try container.decodeIfPresent(String.self, forKey: .city)) ?? ""
        state = (try container.decodeIfPresent(String.self, forKey: .state)) ?? ""
        country = (try container.decodeIfPresent(String.self, forKey: .country)) ?? ""
        tier = (try? container.decodeIfPresent(String.self, forKey: .tier)) ?? ""
        isFeatured = (try? container.decodeIfPresent(Bool.self, forKey: .isFeatured)) ?? false
    }

    private static func decodeID(from container: KeyedDecodingContainer<CodingKeys>) -> String {
        if let stringID = try? container.decode(String.self, forKey: .id) {
            return stringID
        }
        if let intID = try? container.decode(Int.self, forKey: .id) {
            return String(intID)
        }
        return ""
    }
}

struct SwipeCard: Identifiable, Equatable {
    let id: String
    let imageName: String
    let imageURL: String?
    let source: String
    let caption: String
    let editorialCue: String
    let location: String
    let aesthetic: String
    let category: String
    let lookType: String
    let hairLook: String
    let makeupLook: String
    let rawTags: [String]
    let tags: [StyleTag]
    let isUpgradedArtist: Bool
    let isFeaturedArtist: Bool

    var assetName: String {
        imageName.replacingOccurrences(of: ".jpg", with: "")
    }

    init(
        id: String,
        imageName: String = "",
        imageURL: String? = nil,
        source: String = "built-in",
        caption: String,
        editorialCue: String,
        location: String = "",
        aesthetic: String = "",
        category: String = "",
        lookType: String = "",
        hairLook: String = "",
        makeupLook: String = "",
        rawTags: [String] = [],
        tags: [StyleTag],
        isUpgradedArtist: Bool = false,
        isFeaturedArtist: Bool = false
    ) {
        self.id = id
        self.imageName = imageName
        self.imageURL = imageURL
        self.source = source
        self.caption = caption
        self.editorialCue = editorialCue
        self.location = location
        self.aesthetic = aesthetic
        self.category = category
        self.lookType = lookType
        self.hairLook = hairLook
        self.makeupLook = makeupLook
        self.rawTags = rawTags
        self.tags = tags
        self.isUpgradedArtist = isUpgradedArtist
        self.isFeaturedArtist = isFeaturedArtist
    }

    var resultCues: [String] {
        (rawTags + [category, lookType, hairLook, makeupLook])
            .map { Self.displayCue($0) }
            .filter { !$0.isEmpty }
    }

    var preferenceTags: [PreferenceTag] {
        if let builtInTags = Self.builtInPreferenceTags[id] {
            return builtInTags
        }

        let text = (rawTags + [category, lookType, hairLook, makeupLook, caption, aesthetic])
            .joined(separator: " ")
            .lowercased()
        var tags: [PreferenceTag] = []

        func append(_ label: String, group: String, keywords: [String], weight: Int = 2) {
            if keywords.contains(where: { text.contains($0) }) {
                tags.append(PreferenceTag(label, group: group, weight: weight))
            }
        }

        append("smooth_structured_hair", group: "hair_structure", keywords: ["sleek", "smooth", "structured", "sculpt", "polished"])
        append("loose_textured_hair", group: "hair_structure", keywords: ["loose", "texture", "textured", "boho", "undone", "messy", "curl"])
        append("smooth_finish", group: "hair_finish", keywords: ["sleek", "smooth", "polished"])
        append("textured_finish", group: "hair_finish", keywords: ["texture", "textured", "curl", "wave", "boho", "undone"])
        append("face_framing", group: "face", keywords: ["face_framing", "face framing", "tendril", "front pieces"])
        append("hair_away_from_face", group: "face", keywords: ["slicked", "clean hairline", "away from face"])
        append("high_placement", group: "placement", keywords: ["high bun", "high pony", "high"])
        append("low_placement", group: "placement", keywords: ["low bun", "low pony", "chignon", "low"])
        append("defined_eyes", group: "eyes", keywords: ["defined", "smokey", "smoky", "cut crease", "glam", "lashes"])
        append("diffused_eyes", group: "eyes", keywords: ["soft glam", "diffused", "soft eye"])
        append("minimal_makeup", group: "makeup_intensity", keywords: ["minimal", "natural makeup", "bare", "fresh"])
        append("strong_makeup", group: "makeup_intensity", keywords: ["full glam", "glam", "smokey", "cut crease", "bold"])
        append("luminous_skin", group: "skin_finish", keywords: ["luminous", "dewy", "glow"])
        append("natural_skin", group: "skin_finish", keywords: ["natural", "fresh", "minimal"])
        append("satin_skin", group: "skin_finish", keywords: ["satin", "soft focus", "soft-focus", "polished"])
        append("sculpted_skin", group: "skin_finish", keywords: ["sculpt", "contour", "glam"])
        append("neutral_tones", group: "tone", keywords: ["neutral", "classic", "timeless"])
        append("rosy_tones", group: "tone", keywords: ["rosy", "blush", "romantic"])
        append("warm_tones", group: "tone", keywords: ["warm", "golden", "bronze"])
        append("deeper_tones", group: "tone", keywords: ["dark", "black", "deeper"])
        append("clean_editorial_details", group: "detail_style", keywords: ["editorial", "clean", "modern", "fashion"])
        append("romantic_organic_details", group: "detail_style", keywords: ["romantic", "boho", "floral", "baby's breath", "organic"])
        append("visible_accessories", group: "accessory", keywords: ["tiara", "pearl", "crystal", "vine", "comb", "veil", "pin"])
        append("controlled_volume", group: "volume", keywords: ["controlled", "structured", "sleek", "sculpted"])
        append("airy_volume", group: "volume", keywords: ["airy", "loose", "voluminous", "soft", "texture"])
        append("center_part", group: "parting", keywords: ["center part"])
        append("side_part", group: "parting", keywords: ["side part", "side profile"])
        append("clean_silhouette", group: "silhouette", keywords: ["sleek", "smooth", "structured", "clean", "editorial"])
        append("soft_silhouette", group: "silhouette", keywords: ["soft", "loose", "romantic", "boho"])

        return tags.isEmpty ? [PreferenceTag("balanced_hair_structure", group: "hair_structure", weight: 1)] : tags
    }

    private static func displayCue(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "_")
            .map { word in
                word.prefix(1).uppercased() + word.dropFirst()
            }
            .joined(separator: " ")
    }

    private static func preferenceTags(_ tags: PreferenceTag...) -> [PreferenceTag] {
        tags
    }

    private static let builtInPreferenceTags: [String: [PreferenceTag]] = [
        "soft-half-up-natural": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("half_up_shape", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2)
        ),
        "tiara-tight-curls": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("defined_eyes", group: "eyes", weight: 3),
            PreferenceTag("strong_makeup", group: "makeup_intensity", weight: 3),
            PreferenceTag("luminous_skin", group: "skin_finish", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("deeper_tones", group: "tone", weight: 2)
        ),
        "sleek-half-up-waves": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("half_up_shape", group: "placement", weight: 2),
            PreferenceTag("side_part", group: "parting", weight: 2),
            PreferenceTag("controlled_volume", group: "volume", weight: 2),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 3),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 2)
        ),
        "voluminous-updo": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 2),
            PreferenceTag("high_placement", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("controlled_volume", group: "volume", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 1)
        ),
        "low-pony-robe": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("face_framing", group: "face", weight: 3),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "curly-half-updo": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("half_up_shape", group: "placement", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "minimal-soft-bun": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 1),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 3),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 3),
            PreferenceTag("diffused_eyes", group: "eyes", weight: 2),
            PreferenceTag("minimal_accessories", group: "accessory", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "boho-half-up": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("half_up_shape", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("airy_volume", group: "volume", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3)
        ),
        "sleek-center-part": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("center_part", group: "parting", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 2),
            PreferenceTag("satin_skin", group: "skin_finish", weight: 2),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 2)
        ),
        "smokey-eye-waves": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 3),
            PreferenceTag("strong_makeup", group: "makeup_intensity", weight: 3),
            PreferenceTag("sculpted_skin", group: "skin_finish", weight: 2),
            PreferenceTag("deeper_tones", group: "tone", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 1)
        ),
        "soft-down-curls": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("down_hair", group: "placement", weight: 3),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 3),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "slicked-editorial": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 3),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 2),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 3)
        ),
        "dark-half-up": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("half_up_shape", group: "placement", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3),
            PreferenceTag("deeper_tones", group: "tone", weight: 2)
        ),
        "structured-low-bun": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 2),
            PreferenceTag("controlled_volume", group: "volume", weight: 2),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 3),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 2)
        ),
        "pearl-low-bun": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 2),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 3),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "sleek-crystal-bun": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 3),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 3),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3)
        ),
        "curly-updo-veil": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 1),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "long-loose-waves": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("down_hair", group: "placement", weight: 3),
            PreferenceTag("face_framing", group: "face", weight: 1),
            PreferenceTag("airy_volume", group: "volume", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 3)
        ),
        "cascading-ponytail": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("high_placement", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("airy_volume", group: "volume", weight: 3),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "soft-glam-updo": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 3),
            PreferenceTag("satin_skin", group: "skin_finish", weight: 3),
            PreferenceTag("neutral_tones", group: "tone", weight: 2),
            PreferenceTag("controlled_volume", group: "volume", weight: 2)
        ),
        "polished-brunette-waves": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("down_hair", group: "placement", weight: 3),
            PreferenceTag("center_part", group: "parting", weight: 3),
            PreferenceTag("controlled_volume", group: "volume", weight: 2),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2),
            PreferenceTag("deeper_tones", group: "tone", weight: 2)
        ),
        "redhead-curled-back-view": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("down_hair", group: "placement", weight: 3),
            PreferenceTag("warm_tones", group: "tone", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "blonde-updo-soft-glam": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 3),
            PreferenceTag("satin_skin", group: "skin_finish", weight: 2),
            PreferenceTag("neutral_tones", group: "tone", weight: 2),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2)
        ),
        "soft-black-waves-tiara": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("down_hair", group: "placement", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 2),
            PreferenceTag("luminous_skin", group: "skin_finish", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2)
        ),
        "natural-curls-boho": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("down_hair", group: "placement", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3),
            PreferenceTag("airy_volume", group: "volume", weight: 3)
        ),
        "messy-braided-updo": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "long-undone-blonde-waves": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("down_hair", group: "placement", weight: 3),
            PreferenceTag("airy_volume", group: "volume", weight: 2),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 3)
        ),
        "half-up-soft-glam-smile": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("half_up_shape", group: "placement", weight: 3),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 3),
            PreferenceTag("satin_skin", group: "skin_finish", weight: 3),
            PreferenceTag("rosy_tones", group: "tone", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "editorial-afro-texture": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("strong_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2)
        ),
        "redhead-golden-hour-waves": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("down_hair", group: "placement", weight: 2),
            PreferenceTag("medium_makeup_intensity", group: "makeup_intensity", weight: 2),
            PreferenceTag("luminous_skin", group: "skin_finish", weight: 3),
            PreferenceTag("warm_tones", group: "tone", weight: 3),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2)
        ),
        "editorial-veil-closeup": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 3),
            PreferenceTag("defined_eyes", group: "eyes", weight: 2),
            PreferenceTag("strong_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("visible_accessories", group: "accessory", weight: 1),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3)
        ),
        "soft-updo-veil-morning": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 2),
            PreferenceTag("low_placement", group: "placement", weight: 2),
            PreferenceTag("face_framing", group: "face", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "textured-low-bun-floral": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 3),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 3),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "soft-low-bun-pearl-comb": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 1),
            PreferenceTag("low_placement", group: "placement", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 3),
            PreferenceTag("romantic_organic_details", group: "detail_style", weight: 2),
            PreferenceTag("soft_silhouette", group: "silhouette", weight: 2)
        ),
        "glam-cut-crease-tiara": preferenceTags(
            PreferenceTag("smooth_structured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("defined_eyes", group: "eyes", weight: 3),
            PreferenceTag("strong_makeup", group: "makeup_intensity", weight: 3),
            PreferenceTag("sculpted_skin", group: "skin_finish", weight: 3),
            PreferenceTag("visible_accessories", group: "accessory", weight: 2),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 2),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2)
        ),
        "afro-natural-modern": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 3),
            PreferenceTag("textured_finish", group: "hair_finish", weight: 3),
            PreferenceTag("hair_away_from_face", group: "face", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 2),
            PreferenceTag("natural_skin", group: "skin_finish", weight: 2),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2)
        ),
        "minimal-editorial-waves": preferenceTags(
            PreferenceTag("loose_textured_hair", group: "hair_structure", weight: 2),
            PreferenceTag("smooth_finish", group: "hair_finish", weight: 2),
            PreferenceTag("down_hair", group: "placement", weight: 2),
            PreferenceTag("minimal_makeup", group: "makeup_intensity", weight: 3),
            PreferenceTag("satin_skin", group: "skin_finish", weight: 3),
            PreferenceTag("clean_editorial_details", group: "detail_style", weight: 3),
            PreferenceTag("clean_silhouette", group: "silhouette", weight: 2)
        )
    ]

    static let bridalBeautyDeck: [SwipeCard] = [
        SwipeCard(
            id: "soft-half-up-natural",
            imageName: "01-soft-half-up-loose-curls-natural-bridal-makeup.jpg",
            caption: "Soft half-up curls with natural bridal makeup.",
            editorialCue: "Hair + makeup",
            tags: [.init(.soft, 3), .init(.waves, 3), .init(.romantic, 2), .init(.natural, 2), .init(.movement, 1)]
        ),
        SwipeCard(
            id: "tiara-tight-curls",
            imageName: "02-tiara-tight-curls-glossy-bridal-glam.jpg",
            caption: "Glossy curls with stronger glam definition.",
            editorialCue: "Hair + makeup",
            tags: [.init(.glam, 3), .init(.definedEyes, 2), .init(.waves, 2), .init(.polished, 2), .init(.editorial, 1)]
        ),
        SwipeCard(
            id: "sleek-half-up-waves",
            imageName: "03-sleek-half-up-long-hollywood-waves-side-profile.jpg",
            caption: "Sleek Hollywood waves with controlled structure.",
            editorialCue: "Hair shape",
            tags: [.init(.structured, 3), .init(.waves, 3), .init(.polished, 2), .init(.editorial, 2)]
        ),
        SwipeCard(
            id: "voluminous-updo",
            imageName: "04-voluminous-updo-tiara-face-framing-curls.jpg",
            caption: "A sculpted updo with romantic framing.",
            editorialCue: "Silhouette",
            tags: [.init(.updo, 3), .init(.structured, 2), .init(.romantic, 2), .init(.classic, 1)]
        ),
        SwipeCard(
            id: "low-pony-robe",
            imageName: "05-low-pony-face-framing-curls-bridal-robe.jpg",
            caption: "Soft bridal prep styling with face-framing detail.",
            editorialCue: "Detail",
            tags: [.init(.soft, 2), .init(.natural, 2), .init(.movement, 2), .init(.minimal, 1)]
        ),
        SwipeCard(
            id: "curly-half-updo",
            imageName: "06-curly-half-updo-gold-hair-vine-back-view.jpg",
            caption: "Curled half-up styling with romantic texture.",
            editorialCue: "Hair shape",
            tags: [.init(.romantic, 3), .init(.waves, 2), .init(.movement, 2), .init(.soft, 2)]
        ),
        SwipeCard(
            id: "minimal-soft-bun",
            imageName: "07-minimal-bridal-makeup-soft-bun-veil-closeup.jpg",
            caption: "Minimal bridal beauty with a soft bun finish.",
            editorialCue: "Makeup focus",
            tags: [.init(.minimal, 3), .init(.soft, 2), .init(.natural, 2), .init(.updo, 1)]
        ),
        SwipeCard(
            id: "boho-half-up",
            imageName: "08-loose-half-up-boho-waves-pearl-hair-vine.jpg",
            caption: "Loose boho waves with airy softness.",
            editorialCue: "Hair shape",
            tags: [.init(.soft, 3), .init(.movement, 3), .init(.waves, 2), .init(.lowStructure, 1)]
        ),
        SwipeCard(
            id: "sleek-center-part",
            imageName: "09-sleek-center-part-soft-bridal-makeup-pearl-headband.jpg",
            caption: "Clean center part with refined makeup polish.",
            editorialCue: "Detail",
            tags: [.init(.structured, 2), .init(.cleanHairline, 3), .init(.polished, 2)]
        ),
        SwipeCard(
            id: "smokey-eye-waves",
            imageName: "10-glam-smokey-eye-loose-black-waves-veil.jpg",
            caption: "Defined eye makeup with glam bridal waves.",
            editorialCue: "Makeup focus",
            tags: [.init(.definedEyes, 3), .init(.glam, 3), .init(.waves, 2)]
        ),
        SwipeCard(
            id: "soft-down-curls",
            imageName: "11-soft-down-curls-natural-bridal-makeup.jpg",
            caption: "Soft curls with understated bridal makeup.",
            editorialCue: "Hair + makeup",
            tags: [.init(.soft, 3), .init(.natural, 3), .init(.waves, 2)]
        ),
        SwipeCard(
            id: "slicked-editorial",
            imageName: "12-slicked-back-editorial-bridal-beauty-closeup.jpg",
            caption: "Editorial slicked-back beauty with structure.",
            editorialCue: "Editorial",
            tags: [.init(.editorial, 3), .init(.structured, 3), .init(.polished, 2)]
        ),
        SwipeCard(
            id: "dark-half-up",
            imageName: "13-dark-half-up-waves-babys-breath-pins.jpg",
            caption: "Romantic half-up waves with floral detail.",
            editorialCue: "Hair shape",
            tags: [.init(.waves, 3), .init(.romantic, 2), .init(.soft, 2)]
        ),
        SwipeCard(
            id: "structured-low-bun",
            imageName: "14-smooth-structured-low-bun-side-profile.jpg",
            caption: "A smooth low bun with controlled structure.",
            editorialCue: "Silhouette",
            tags: [.init(.updo, 3), .init(.structured, 3), .init(.classic, 2)]
        ),
        SwipeCard(
            id: "pearl-low-bun",
            imageName: "15-blonde-low-bun-pearl-cluster-pin.jpg",
            caption: "Classic low bun with soft pearl detail.",
            editorialCue: "Detail",
            tags: [.init(.updo, 3), .init(.classic, 2), .init(.soft, 1)]
        ),
        SwipeCard(
            id: "sleek-crystal-bun",
            imageName: "16-sleek-low-bun-crystal-headpiece.jpg",
            caption: "Sleek bridal styling with crystal accents.",
            editorialCue: "Hair shape",
            tags: [.init(.structured, 3), .init(.updo, 3), .init(.editorial, 1)]
        ),
        SwipeCard(
            id: "curly-updo-veil",
            imageName: "17-curly-updo-veil-side-profile.jpg",
            caption: "Curly updo with soft bridal movement.",
            editorialCue: "Silhouette",
            tags: [.init(.updo, 3), .init(.romantic, 2), .init(.movement, 2)]
        ),
        SwipeCard(
            id: "long-loose-waves",
            imageName: "18-long-loose-waves-off-shoulder-bridal-look.jpg",
            caption: "Long loose waves with romantic softness.",
            editorialCue: "Hair shape",
            tags: [.init(.waves, 3), .init(.soft, 3), .init(.romantic, 2)]
        ),
        SwipeCard(
            id: "cascading-ponytail",
            imageName: "19-cascading-blonde-ponytail-textured-style.jpg",
            caption: "Textured ponytail styling with movement.",
            editorialCue: "Hair shape",
            tags: [.init(.movement, 3), .init(.waves, 2), .init(.soft, 2)]
        ),
        SwipeCard(
            id: "soft-glam-updo",
            imageName: "20-soft-glam-blonde-updo-high-neck-gown.jpg",
            caption: "Soft glam makeup with a polished updo.",
            editorialCue: "Hair + makeup",
            tags: [.init(.softFocusSkin, 2), .init(.updo, 2), .init(.polished, 2), .init(.classic, 1)]
        ),
        SwipeCard(
            id: "polished-brunette-waves",
            imageName: "21-polished-brunette-waves-center-part.jpg",
            caption: "Polished brunette waves with a clean center part.",
            editorialCue: "Hair shape",
            tags: [.init(.waves, 3), .init(.polished, 3), .init(.structured, 2), .init(.classic, 1)]
        ),
        SwipeCard(
            id: "redhead-curled-back-view",
            imageName: "22-redhead-curled-bridal-hair-back-view.jpg",
            caption: "Defined curled bridal hair with a romantic back view.",
            editorialCue: "Hair shape",
            tags: [.init(.waves, 3), .init(.romantic, 2), .init(.structured, 2), .init(.movement, 1)]
        ),
        SwipeCard(
            id: "blonde-updo-soft-glam",
            imageName: "23-blonde-updo-soft-glam-robe-look.jpg",
            caption: "A blonde updo paired with soft glam bridal makeup.",
            editorialCue: "Hair + makeup",
            tags: [.init(.updo, 3), .init(.softFocusSkin, 2), .init(.polished, 2), .init(.glam, 1)]
        ),
        SwipeCard(
            id: "soft-black-waves-tiara",
            imageName: "24-soft-black-waves-dewy-bridal-glam-tiara.jpg",
            caption: "Soft black waves with dewy glam and a tiara.",
            editorialCue: "Hair + makeup",
            tags: [.init(.waves, 3), .init(.glam, 2), .init(.soft, 2), .init(.romantic, 1)]
        ),
        SwipeCard(
            id: "natural-curls-boho",
            imageName: "25-natural-curls-soft-boho-bridal-look.jpg",
            caption: "Natural curls with a soft boho bridal finish.",
            editorialCue: "Hair shape",
            tags: [.init(.natural, 3), .init(.movement, 3), .init(.soft, 2), .init(.lowStructure, 2)]
        ),
        SwipeCard(
            id: "messy-braided-updo",
            imageName: "26-messy-braided-updo-babys-breath-pins.jpg",
            caption: "A textured braided updo with baby's breath pins.",
            editorialCue: "Silhouette",
            tags: [.init(.updo, 3), .init(.lowStructure, 3), .init(.romantic, 2), .init(.movement, 2)]
        ),
        SwipeCard(
            id: "long-undone-blonde-waves",
            imageName: "27-long-undone-blonde-waves-back-view.jpg",
            caption: "Long undone blonde waves with relaxed movement.",
            editorialCue: "Hair shape",
            tags: [.init(.waves, 3), .init(.movement, 3), .init(.lowStructure, 2), .init(.soft, 2)]
        ),
        SwipeCard(
            id: "half-up-soft-glam-smile",
            imageName: "28-half-up-bridal-hair-soft-glam-smile.jpg",
            caption: "Half-up bridal hair with soft glam polish.",
            editorialCue: "Hair + makeup",
            tags: [.init(.soft, 3), .init(.waves, 2), .init(.polished, 2), .init(.softFocusSkin, 2)]
        ),
        SwipeCard(
            id: "editorial-afro-texture",
            imageName: "29-editorial-afro-texture-bridal-beauty.jpg",
            caption: "Editorial bridal beauty with natural afro texture.",
            editorialCue: "Editorial",
            tags: [.init(.editorial, 3), .init(.natural, 3), .init(.structured, 2), .init(.movement, 1)]
        ),
        SwipeCard(
            id: "redhead-golden-hour-waves",
            imageName: "30-redhead-loose-waves-soft-golden-hour-glam.jpg",
            caption: "Loose redhead waves with soft golden-hour glam.",
            editorialCue: "Hair + makeup",
            tags: [.init(.waves, 3), .init(.soft, 2), .init(.glam, 2), .init(.romantic, 1)]
        ),
        SwipeCard(
            id: "editorial-veil-closeup",
            imageName: "31-editorial-veil-closeup-sleek-bridal-beauty.jpg",
            caption: "Sleek editorial bridal beauty under a veil.",
            editorialCue: "Editorial",
            tags: [.init(.editorial, 3), .init(.structured, 3), .init(.polished, 2), .init(.cleanHairline, 1)]
        ),
        SwipeCard(
            id: "soft-updo-veil-morning",
            imageName: "32-soft-updo-veil-bridal-robe-morning.jpg",
            caption: "A soft updo and veil for a quiet bridal morning.",
            editorialCue: "Silhouette",
            tags: [.init(.updo, 3), .init(.soft, 3), .init(.romantic, 2), .init(.natural, 1)]
        ),
        SwipeCard(
            id: "textured-low-bun-floral",
            imageName: "33-textured-low-bun-dried-floral-comb.jpg",
            caption: "Textured low bun with a dried floral comb.",
            editorialCue: "Detail",
            tags: [.init(.updo, 3), .init(.lowStructure, 2), .init(.romantic, 2), .init(.soft, 1)]
        ),
        SwipeCard(
            id: "soft-low-bun-pearl-comb",
            imageName: "34-soft-low-bun-pearl-hair-comb-profile.jpg",
            caption: "Soft low bun with a pearl comb profile.",
            editorialCue: "Detail",
            tags: [.init(.updo, 3), .init(.soft, 2), .init(.classic, 2), .init(.polished, 1)]
        ),
        SwipeCard(
            id: "glam-cut-crease-tiara",
            imageName: "35-glam-cut-crease-makeup-tiara-veil.jpg",
            caption: "Glam cut-crease makeup with a tiara and veil.",
            editorialCue: "Makeup focus",
            tags: [.init(.glam, 3), .init(.definedEyes, 3), .init(.polished, 2), .init(.editorial, 1)]
        ),
        SwipeCard(
            id: "afro-natural-modern",
            imageName: "36-afro-natural-texture-modern-bridal-look.jpg",
            caption: "Modern bridal styling with natural afro texture.",
            editorialCue: "Hair shape",
            tags: [.init(.natural, 3), .init(.structured, 2), .init(.editorial, 2), .init(.movement, 1)]
        ),
        SwipeCard(
            id: "minimal-editorial-waves",
            imageName: "37-minimal-editorial-soft-waves-satin-look.jpg",
            caption: "Minimal editorial beauty with soft satin waves.",
            editorialCue: "Editorial",
            tags: [.init(.minimal, 3), .init(.editorial, 2), .init(.soft, 2), .init(.waves, 2)]
        )
    ]
}

struct StyleTag: Equatable {
    let style: BridalStyle
    let weight: Int

    init(_ style: BridalStyle, _ weight: Int) {
        self.style = style
        self.weight = weight
    }
}

struct StyleScore: Equatable {
    let style: BridalStyle
    let score: Int
}

enum BridalStyle: String, CaseIterable {
    case classic
    case cleanHairline
    case definedEyes
    case editorial
    case glam
    case lowStructure
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
        case .classic:
            return "Classic"
        case .cleanHairline:
            return "Clean hairline"
        case .definedEyes:
            return "Defined eyes"
        case .editorial:
            return "Editorial"
        case .glam:
            return "Glam"
        case .lowStructure:
            return "Low structure"
        case .minimal:
            return "Minimal"
        case .movement:
            return "Movement"
        case .natural:
            return "Natural"
        case .polished:
            return "Polished"
        case .romantic:
            return "Romantic"
        case .soft:
            return "Soft"
        case .softFocusSkin:
            return "Soft-focus skin"
        case .structured:
            return "Structured"
        case .updo:
            return "Updo"
        case .waves:
            return "Waves"
        }
    }
}

private enum BridalPalette {
    static let background = Color(red: 0.980, green: 0.969, blue: 0.961)
    static let surface = Color(red: 1.000, green: 1.000, blue: 1.000)
    static let blush = Color(red: 0.980, green: 0.875, blue: 0.898)
    static let primaryText = Color(red: 0.122, green: 0.122, blue: 0.122)
    static let secondaryText = Color(red: 0.475, green: 0.475, blue: 0.475)
    static let hairline = Color(red: 0.878, green: 0.878, blue: 0.878)
    static let accent = Color(red: 0.914, green: 0.776, blue: 0.922)
}
