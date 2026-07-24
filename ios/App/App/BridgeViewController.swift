import UIKit
import Capacitor
import SwiftUI
import WebKit

final class BridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let swipeDeckMessageName = "swipeDeck"
    private let startCheckoutMessageName = "startCheckout"
    private let artistProfileShareMessageName = "artistProfileShare"
    private let checkoutSessionURL = URL(string: "https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/super-handler")!
    private let billingPortalSessionURL = URL(string: "https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/create-artist-billing-portal-session")!
    private let artistCheckoutSessionURL = URL(string: "https://wrkbkkbxkwawoabqfdeg.supabase.co/functions/v1/create-artist-checkout-session")!
    private let artistPriceID = "price_1TXSH3JS0won4bfC1Hq1eMrL"
    private let bridePriceID = "price_1TW2RAJS0won4bfC9ifilxMS"
    private var swipeDeckHostingController: UIHostingController<SwipeDeckView>?
    private var isWebUserAuthenticated = false
    private var shouldRevealSwipeDeckResults = false
    private var webAuthenticatedUserID: String?
    private var webAuthenticatedAccessToken: String?

    override func viewDidLoad() {
        super.viewDidLoad()
        edgesForExtendedLayout = []
        extendedLayoutIncludesOpaqueBars = false
        installSwipeDeckLauncher()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        guard let scrollView = webView?.scrollView else { return }
        scrollView.isScrollEnabled = true
        scrollView.alwaysBounceVertical = true
        scrollView.bounces = true
        scrollView.contentInsetAdjustmentBehavior = .never
        scrollView.contentInset = .zero
        webView?.isUserInteractionEnabled = true
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: swipeDeckMessageName)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: startCheckoutMessageName)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: artistProfileShareMessageName)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        switch message.name {
        case swipeDeckMessageName:
            if let payload = message.body as? [String: Any] {
                isWebUserAuthenticated = payload["isAuthenticated"] as? Bool ?? false
                shouldRevealSwipeDeckResults = payload["revealResults"] as? Bool ?? false
                webAuthenticatedUserID = payload["user_id"] as? String
                webAuthenticatedAccessToken = Self.authorizationToken(from: payload)
            }
            presentSwipeDeck()
        case startCheckoutMessageName:
            startCheckout(with: message.body)
        case artistProfileShareMessageName:
            shareArtistProfile(with: message.body)
        default:
            return
        }
    }

    private func installSwipeDeckLauncher() {
        let source = """
        (function() {
            if (window.__bridalSwipeDeckLauncherInstalled) {
                return;
            }
            window.__bridalSwipeDeckLauncherInstalled = true;
            function storageLooksAuthenticated(storage) {
                try {
                    for (var index = 0; index < storage.length; index += 1) {
                        var key = storage.key(index) || '';
                        var value = storage.getItem(key) || '';
                        if (key.indexOf('supabase') !== -1 || key.indexOf('sb-') === 0 || value.indexOf('access_token') !== -1) {
                            if (value.indexOf('access_token') !== -1 && value.indexOf('user') !== -1) {
                                return true;
                            }
                        }
                    }
                } catch (error) {}
                return false;
            }
            function isAuthenticated() {
                return storageLooksAuthenticated(window.localStorage) || storageLooksAuthenticated(window.sessionStorage);
            }
            function sessionFromStorage(storage) {
                try {
                    for (var index = 0; index < storage.length; index += 1) {
                        var key = storage.key(index) || '';
                        var value = storage.getItem(key) || '';
                        if (!(key.indexOf('supabase') !== -1 || key.indexOf('sb-') === 0 || value.indexOf('access_token') !== -1)) {
                            continue;
                        }
                        try {
                            var parsed = JSON.parse(value);
                            var session = parsed && parsed.currentSession ? parsed.currentSession : parsed;
                            if (session && session.access_token && session.user && session.user.id) {
                                return {
                                    access_token: session.access_token,
                                    user_id: session.user.id
                                };
                            }
                        } catch (error) {}
                    }
                } catch (error) {}
                return null;
            }
            function currentSessionPayload() {
                return sessionFromStorage(window.localStorage) || sessionFromStorage(window.sessionStorage) || {};
            }
            var pendingElement = null;
            var pendingAction = null;
            var authWasPresent = isAuthenticated();
            var protectedMatchers = [
                /result/i,
                /artist/i,
                /save/i,
                /profile/i,
                /timeline/i,
                /product/i,
                /inspo/i,
                /premium/i,
                /recommendation/i,
                /beauty plan/i
            ];
            var allowedMatchers = [
                /^take .*quiz$/i,
                /^retake quiz$/i,
                /^discover my bridal edit$/i,
                /^sign in$/i,
                /^create free account$/i,
                /^sign up$/i,
                /^back$/i,
                /^back to home$/i,
                /^return to home$/i
            ];
            function textFor(element) {
                return (element && (element.innerText || element.textContent) || '').replace(/\\s+/g, ' ').trim();
            }
            function isAllowed(text) {
                return allowedMatchers.some(function(matcher) { return matcher.test(text); });
            }
            function isProtected(element) {
                if (!element || element.closest('[data-bridal-account-gate]')) {
                    return false;
                }
                var text = textFor(element);
                if (!text || isAllowed(text)) {
                    return false;
                }
                var href = element.getAttribute && (element.getAttribute('href') || '');
                var routeHint = (text + ' ' + href + ' ' + (element.getAttribute && (element.getAttribute('aria-label') || ''))).toLowerCase();
                return protectedMatchers.some(function(matcher) { return matcher.test(routeHint); });
            }
            function gateModeFor(element) {
                var text = textFor(element);
                var href = element && element.getAttribute && (element.getAttribute('href') || '');
                var label = (text + ' ' + href + ' ' + (element && element.getAttribute && (element.getAttribute('aria-label') || ''))).toLowerCase();
                if (/quiz[^a-z0-9]*result|swipe[^a-z0-9]*result|result/.test(label)) {
                    return 'results';
                }
                return 'general';
            }
            function findAuthTrigger(label) {
                var candidates = Array.prototype.slice.call(document.querySelectorAll('button, a, [role="button"]'));
                return candidates.find(function(candidate) {
                    return !candidate.closest('[data-bridal-account-gate]') && textFor(candidate).toLowerCase() === label.toLowerCase();
                });
            }
            function openExistingAuth(label) {
                var trigger = findAuthTrigger(label);
                if (trigger) {
                    window.__bridalAllowProtectedClick = true;
                    trigger.click();
                    window.setTimeout(function() { window.__bridalAllowProtectedClick = false; }, 0);
                }
            }
            function closeGate() {
                var existing = document.querySelector('[data-bridal-account-gate]');
                if (existing) {
                    existing.remove();
                }
            }
            function gateCopy(mode) {
                if (mode === 'results') {
                    return {
                        title: 'Your results are ready.',
                        body: 'Create your free account to unlock your bridal beauty results, save your archetype, explore artists, and build your wedding beauty plan.',
                        small: 'Your account keeps your results, saved artists, and timeline in one place.'
                    };
                }
                return {
                    title: 'Create your account to continue.',
                    body: 'The Bridal Edit works best when your beauty preferences, saved artists, timeline, and recommendations live in one place.',
                    small: 'It only takes a minute.'
                };
            }
            function escapeHTML(value) {
                return String(value).replace(/[&<>"']/g, function(character) {
                    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
                });
            }
            function showGate(mode, target, action) {
                var resolvedMode = mode === 'results' ? 'results' : 'general';
                var copy = gateCopy(resolvedMode);
                pendingElement = target || pendingElement;
                pendingAction = action || pendingAction;
                closeGate();
                var overlay = document.createElement('div');
                overlay.setAttribute('data-bridal-account-gate', 'true');
                overlay.setAttribute('data-account-gate-mode', resolvedMode);
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';
                overlay.innerHTML = '<div style="width:100%;max-width:440px;background:#fff;color:#111;padding:24px;box-shadow:0 18px 50px rgba(0,0,0,.28);box-sizing:border-box;font-family:Georgia,serif;">'
                    + '<button type="button" data-close style="float:right;background:none;border:0;font-size:24px;line-height:1;color:#777;">×</button>'
                    + '<h2 style="font-family:Georgia,serif;font-size:25px;font-weight:400;line-height:1.2;margin:8px 0 12px;">' + escapeHTML(copy.title) + '</h2>'
                    + '<p style="font-size:15px;line-height:1.6;margin:0 0 18px;color:#444;">' + escapeHTML(copy.body) + '</p>'
                    + '<button type="button" data-create style="width:100%;background:#111;color:#fff;border:0;padding:13px;font:10px Futura,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;margin-bottom:9px;">Create Free Account</button>'
                    + '<button type="button" data-signin style="width:100%;background:#fff;color:#111;border:.5px solid #111;padding:12px;font:10px Futura,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;margin-bottom:12px;">Sign In</button>'
                    + '<p style="font-size:13px;line-height:1.5;margin:0;color:#777;font-style:italic;">' + escapeHTML(copy.small) + '</p>'
                    + '</div>';
                overlay.querySelector('[data-close]').addEventListener('click', closeGate);
                overlay.querySelector('[data-create]').addEventListener('click', function() {
                    closeGate();
                    openExistingAuth('Create Free Account');
                });
                overlay.querySelector('[data-signin]').addEventListener('click', function() {
                    closeGate();
                    openExistingAuth('Sign In');
                });
                document.body.appendChild(overlay);
            }
            window.__bridalGuestAuth = {
                isAuthenticated: isAuthenticated,
                showGate: function(mode, target, action) { showGate(mode, target, action); }
            };
            document.addEventListener('click', function(event) {
                var actionElement = event.target.closest && event.target.closest('button, a, [role="button"]');
                if (!window.__bridalAllowProtectedClick && !isAuthenticated() && isProtected(actionElement)) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.stopImmediatePropagation();
                    showGate(gateModeFor(actionElement), actionElement, null);
                    return;
                }
                var button = event.target.closest && event.target.closest('button');
                if (!button || button.textContent.trim() !== 'Discover My Bridal Edit') {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                var sessionPayload = currentSessionPayload();
                sessionPayload.isAuthenticated = isAuthenticated();
                window.webkit.messageHandlers.\(swipeDeckMessageName).postMessage(sessionPayload);
            }, true);
            window.setInterval(function() {
                var authed = isAuthenticated();
                if (authed && !authWasPresent && pendingAction === 'swipeDeckResults') {
                    pendingAction = null;
                    closeGate();
                    var sessionPayload = currentSessionPayload();
                    sessionPayload.isAuthenticated = true;
                    sessionPayload.revealResults = true;
                    window.webkit.messageHandlers.\(swipeDeckMessageName).postMessage(sessionPayload);
                } else if (authed && !authWasPresent && pendingElement && document.contains(pendingElement)) {
                    var target = pendingElement;
                    pendingElement = null;
                    closeGate();
                    window.__bridalAllowProtectedClick = true;
                    target.click();
                    window.setTimeout(function() { window.__bridalAllowProtectedClick = false; }, 0);
                }
                authWasPresent = authed;
            }, 800);
        })();
        """

        let userContentController = webView?.configuration.userContentController
        userContentController?.removeScriptMessageHandler(forName: swipeDeckMessageName)
        userContentController?.removeScriptMessageHandler(forName: startCheckoutMessageName)
        userContentController?.removeScriptMessageHandler(forName: artistProfileShareMessageName)
        userContentController?.add(self, name: swipeDeckMessageName)
        userContentController?.add(self, name: startCheckoutMessageName)
        userContentController?.add(self, name: artistProfileShareMessageName)
        userContentController?.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        webView?.evaluateJavaScript(source)
    }

    private func shareArtistProfile(with body: Any) {
        guard let payload = body as? [String: Any] else {
            print("ARTIST SHARE aborted: payload was not a dictionary")
            return
        }

        let businessName = cleanShareText(payload["businessName"] as? String) ?? "a bridal artist"
        let cleanSlug = cleanShareText(payload["slug"] as? String)
        let cleanID = cleanShareText(payload["id"] as? String)
        guard let profileIdentifier = cleanSlug ?? cleanID else {
            print("Missing artist profile identifier for:", businessName)
            return
        }
        if cleanSlug == nil {
            print("WARNING: Artist slug missing; using UUID fallback")
        }

        let profileURLString = "https://bridal-edit-app.vercel.app/artist/\(profileIdentifier)"
        let shareText = """
        Check out \(businessName) on The Bridal Edit™!

        \(profileURLString)
        """

        print("SHARE ARTIST ID:", cleanID ?? "nil")
        print("SHARE ARTIST BUSINESS:", businessName)
        print("SHARE ARTIST RAW SLUG:", cleanSlug ?? "nil")
        print("PROFILE IDENTIFIER:", profileIdentifier)
        print("SHARE TEXT:", shareText)

        let activityController = UIActivityViewController(
            activityItems: [shareText],
            applicationActivities: nil
        )
        if let popover = activityController.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        present(activityController, animated: true)
    }

    private func cleanShareText(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private func presentSwipeDeck() {
        guard presentedViewController == nil else { return }
        let hostingController = swipeDeckHostingController ?? UIHostingController(
            rootView: makeSwipeDeckView()
        )
        hostingController.rootView = makeSwipeDeckView()
        swipeDeckHostingController = hostingController
        hostingController.modalPresentationStyle = .fullScreen
        present(hostingController, animated: true)
        shouldRevealSwipeDeckResults = false
    }

    private func makeSwipeDeckView() -> SwipeDeckView {
        SwipeDeckView(
            isAuthenticated: isWebUserAuthenticated,
            revealResultsOnAppear: shouldRevealSwipeDeckResults,
            authenticatedUserID: webAuthenticatedUserID,
            authenticatedAccessToken: webAuthenticatedAccessToken,
            onDismiss: { [weak self] in
                self?.dismiss(animated: true)
            },
            onRequireAccount: { [weak self] gateMode in
                self?.openAccountGate(mode: gateMode)
            },
            onPreferenceUpdate: { [weak self] payload in
                self?.publishSwipePreferences(payload)
            }
        )
    }

    private func publishSwipePreferences(_ payload: SwipePreferencePayload) {
        do {
            let data = try JSONEncoder().encode(payload)
            guard let json = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript("""
            (function() {
                var payload = \(json);
                try {
                    window.localStorage.setItem('bridalSwipePreferenceSummary', JSON.stringify(payload));
                } catch (error) {
                    console.error('Could not save swipe preference summary', error);
                }
                window.dispatchEvent(new CustomEvent('bridalSwipePreferencesUpdated', { detail: payload }));
            })();
            """)
        } catch {
            print("SWIPE PREFERENCE PAYLOAD ENCODE FAILED", error.localizedDescription)
        }
    }

    private func openAccountGate(mode: String) {
        dismiss(animated: true) { [weak self] in
            let escapedMode = mode.replacingOccurrences(of: "'", with: "\\'")
            self?.webView?.evaluateJavaScript("""
            if (window.__bridalGuestAuth && window.__bridalGuestAuth.showGate) {
                window.__bridalGuestAuth.showGate('\(escapedMode)', null, '\(escapedMode == "results" ? "swipeDeckResults" : "")');
            }
            """)
        }
    }

    private func startCheckout(with body: Any) {
        print("CHECKOUT BUTTON TAPPED")
        print("Membership button tapped")

        guard let payload = body as? [String: Any] else {
            print("MEMBERSHIP CHECKOUT full error object: membership payload was not a dictionary: \(body)")
            showMembershipUnavailableAlert(isArtistBilling: false)
            return
        }

        let userID = payload["user_id"] as? String
        let email = payload["email"] as? String
        let token = Self.authorizationToken(from: payload)
        let isSubscribed = payload["is_subscribed"] as? Bool ?? false
        let isArtistMembership = payload["is_artist_membership"] as? Bool ?? false
        let userRole = payload["role"] as? String ?? "bride"
        let buttonSource = payload["button_source"] as? String ?? "unknown"
        let requestedFunctionName = (payload["checkout_function"] as? String) ?? ""
        let resolvedFunctionName: String
        if !requestedFunctionName.isEmpty {
            resolvedFunctionName = requestedFunctionName
        } else if isArtistMembership {
            resolvedFunctionName = isSubscribed ? "create-artist-billing-portal-session" : "create-artist-checkout-session"
        } else {
            resolvedFunctionName = "super-handler"
        }
        let checkoutTypeRequested: String = {
            if let provided = payload["type"] as? String, !provided.isEmpty { return provided }
            if isArtistMembership { return isSubscribed ? "artist_billing_portal" : "artist_checkout" }
            return isSubscribed ? "billing_portal" : "bride_premium_checkout"
        }()
        let functionURL: URL = {
            switch resolvedFunctionName {
            case "create-artist-checkout-session": return artistCheckoutSessionURL
            case "create-artist-billing-portal-session": return billingPortalSessionURL
            default: return checkoutSessionURL
            }
        }()
        let isBillingPortalCall = resolvedFunctionName == "create-artist-billing-portal-session"
        let functionName = resolvedFunctionName
        let logPrefix: String = {
            switch resolvedFunctionName {
            case "create-artist-checkout-session": return "ARTIST CHECKOUT"
            case "create-artist-billing-portal-session": return "ARTIST BILLING PORTAL"
            default: return "BRIDE PREMIUM CHECKOUT"
            }
        }()

        print("BUTTON SOURCE: \(buttonSource)")
        print("resolved role: \(userRole)")
        print("selected Supabase function: \(functionName)")
        print("user role: \(userRole)")
        print("checkout type requested: \(checkoutTypeRequested)")
        print("current user id: \(userID ?? "missing")")
        print("current session exists: \((payload["session_exists"] as? Bool) ?? true)")
        print("access token exists: \(token != nil)")
        print("exact Supabase Edge Function name being called: \(functionName)")
        print("Supabase function called: \(functionName)")
        print("artist membership flow: \(isArtistMembership)")
        if resolvedFunctionName == "create-artist-checkout-session" {
            print("ARTIST CHECKOUT STARTED")
            print("ARTIST CHECKOUT FUNCTION NAME: \(functionName)")
            print("ARTIST CHECKOUT PRICE ID: \(artistPriceID)")
        } else if !isArtistMembership && resolvedFunctionName == "super-handler" && !isSubscribed {
            print("BRIDE CHECKOUT STARTED")
            print("BRIDE CHECKOUT PRICE ID: \(bridePriceID)")
        }

        guard let userID, let email, let token else {
            print("\(logPrefix) full error object: membership payload missing user_id, email, or access token")
            print("\(logPrefix) full returned data object: \(payload)")
            showMembershipUnavailableAlert(isArtistBilling: isArtistMembership)
            return
        }

        print("current session exists: true")
        print("access token exists: true")
        print("subscription status: \(isSubscribed ? "active" : "inactive")")
        print("\(logPrefix) route: \(functionName)")
        print("function URL/call started: \(functionName) \(functionURL.absoluteString)")

        var request = URLRequest(url: functionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        do {
            var requestBody: [String: Any] = [
                "user_id": userID,
                "email": email,
                "type": checkoutTypeRequested
            ]

            if isArtistMembership {
                requestBody["account_type"] = "artist"
                requestBody["price_id"] = artistPriceID
            } else {
                requestBody["account_type"] = "bride"
                requestBody["price_id"] = bridePriceID
            }

            if isBillingPortalCall {
                requestBody["return_url"] = "https://wrkbkkbxkwawoabqfdeg.supabase.co"
            }

            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
        } catch {
            print("\(logPrefix) full error object: \(error)")
            print("full error if failed: \(error)")
            showMembershipUnavailableAlert(isArtistBilling: isArtistMembership)
            return
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let httpResponse = response as? HTTPURLResponse {
                print("\(logPrefix) response status code: \(httpResponse.statusCode)")
            } else {
                print("\(logPrefix) response status code: none")
            }

            if let error {
                print("\(logPrefix) full error object: \(error)")
                print("full error if failed: \(error)")
            } else {
                print("\(logPrefix) full error object: none")
            }

            let rawResponse = data.flatMap { String(data: $0, encoding: .utf8) } ?? "<no response data>"
            print("\(logPrefix) full returned data object: \(rawResponse)")

            guard
                error == nil,
                let httpResponse = response as? HTTPURLResponse,
                httpResponse.statusCode == 200,
                let data
            else {
                let responseMessage = data.flatMap { Self.errorMessage(from: $0) }
                if let responseMessage {
                    print("\(logPrefix) real error message: \(responseMessage)")
                    print("full error if failed: \(responseMessage)")
                }
                DispatchQueue.main.async { [weak self] in
                    self?.showMembershipUnavailableAlert(isArtistBilling: isArtistMembership)
                }
                return
            }

            let stripeURL = Self.stripeURL(from: data)
            if let stripeURL {
                print("returned checkout URL: \(stripeURL.absoluteString)")
                print("final Stripe URL opened: \(stripeURL.absoluteString)")
            } else {
                print("\(logPrefix) full error object: Stripe URL is nil")
                print("full error if failed: Stripe URL is nil")
            }

            guard let stripeURL else {
                DispatchQueue.main.async { [weak self] in
                    self?.showMembershipUnavailableAlert(isArtistBilling: isArtistMembership)
                }
                return
            }

            DispatchQueue.main.async {
                UIApplication.shared.open(stripeURL)
            }
        }.resume()
    }

    private func showMembershipUnavailableAlert(isArtistBilling: Bool) {
        guard presentedViewController == nil else { return }

        let alertController = UIAlertController(
            title: nil,
            message: isArtistBilling
                ? "We couldn’t open artist billing right now."
                : "We couldn't open Premium membership right now. Please try again in a moment.",
            preferredStyle: .alert
        )
        alertController.addAction(UIAlertAction(title: "OK", style: .default))
        present(alertController, animated: true)
    }

    private static func stripeURL(from data: Data) -> URL? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let urlString = json["url"] as? String
        else {
            return nil
        }

        return URL(string: urlString)
    }

    private static func errorMessage(from data: Data) -> String? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return String(data: data, encoding: .utf8)
        }

        return json["error"] as? String
            ?? json["message"] as? String
            ?? String(data: data, encoding: .utf8)
    }

    private static func authorizationToken(from payload: [String: Any]) -> String? {
        let rawToken = payload["token"] as? String
            ?? payload["access_token"] as? String
            ?? payload["authorization"] as? String

        guard let rawToken else { return nil }

        if rawToken.localizedCaseInsensitiveCompare("Bearer") == .orderedSame {
            return nil
        }

        if rawToken.localizedCaseInsensitiveContains("Bearer ") {
            return rawToken.replacingOccurrences(of: "Bearer ", with: "", options: .caseInsensitive)
        }

        return rawToken
    }

}
