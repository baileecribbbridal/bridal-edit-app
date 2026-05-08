import UIKit
import Capacitor

final class BridgeViewController: CAPBridgeViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        edgesForExtendedLayout = []
        extendedLayoutIncludesOpaqueBars = false
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
}
