import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        if let launchURL = launchOptions?[.url] as? URL {
            NSLog("APP LAUNCH URL: %@", launchURL.absoluteString)
        } else {
            NSLog("APP LAUNCH URL: (none)")
        }
        let bundleIdentifier = Bundle.main.bundleIdentifier ?? "(missing)"
        NSLog("RevenueCat launch check - bundle identifier: %@", bundleIdentifier)
        if let activityDict = launchOptions?[.userActivityDictionary] as? [String: Any],
           let activity = activityDict["UIApplicationLaunchOptionsUserActivityKey"] as? NSUserActivity,
           let activityURL = activity.webpageURL {
            NSLog("APP LAUNCH UNIVERSAL LINK URL: %@", activityURL.absoluteString)
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        NSLog("AUTH CALLBACK URL (open url): %@", url.absoluteString)
        NSLog("AUTH CALLBACK URL options: %@", String(describing: options))
        let handled = ApplicationDelegateProxy.shared.application(app, open: url, options: options)
        NSLog("AUTH CALLBACK URL handled by Capacitor proxy: %@", handled ? "true" : "false")
        return handled
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        NSLog("AUTH CALLBACK USER ACTIVITY type: %@", userActivity.activityType)
        if let webURL = userActivity.webpageURL {
            NSLog("AUTH CALLBACK URL (universal link): %@", webURL.absoluteString)
        }
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
