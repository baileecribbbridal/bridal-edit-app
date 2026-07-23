//
//  BridgeViewController 2.swift
//  App
//
//  Created by Bailee Cribb on 5/15/26.
//


import UIKit
import Capacitor
import SwiftUI
import WebKit

final class BridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {

    private let swipeDeckMessageName = "swipeDeck"

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
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == swipeDeckMessageName else { return }
        presentSwipeDeck()
    }

    private func installSwipeDeckLauncher() {
        let source = """
        (function() {
            if (window.__bridalSwipeDeckLauncherInstalled) {
                return;
            }
            window.__bridalSwipeDeckLauncherInstalled = true;
            document.addEventListener('click', function(event) {
                var button = event.target.closest && event.target.closest('button');
                if (!button || button.textContent.trim() !== 'Discover My Bridal Edit') {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                window.webkit.messageHandlers.\(swipeDeckMessageName).postMessage({});
            }, true);
        })();
        """

        let userContentController = webView?.configuration.userContentController
        userContentController?.removeScriptMessageHandler(forName: swipeDeckMessageName)
        userContentController?.add(self, name: swipeDeckMessageName)
        userContentController?.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        webView?.evaluateJavaScript(source)
    }

    private func presentSwipeDeck() {
        guard presentedViewController == nil else { return }
        let hostingController = UIHostingController(
            rootView: SwipeDeckView { [weak self] in
                self?.dismiss(animated: true)
            }
        )
        hostingController.modalPresentationStyle = .fullScreen
        present(hostingController, animated: true)
    }
}