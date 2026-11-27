/**
 * iOS builds with the iOS 27 SDK (Xcode 27+) must adopt the UIScene lifecycle, or UIKit stops the
 * app at launch (___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption). Expo SDK 54's
 * template still uses the app-delegate-only lifecycle, so this plugin:
 *
 *  1. Declares a single window scene in Info.plist (UIApplicationSceneManifest).
 *  2. Adds a SceneDelegate to AppDelegate.swift. The app delegate still creates the window and
 *     starts React Native at launch (expo-dev-launcher looks for that window during
 *     didFinishLaunching); the scene delegate attaches that window to the scene and forwards deep
 *     links / universal links, which UIKit now delivers to the scene instead of the app delegate.
 *  3. Raises Pod targets below iOS 15.1 (Xcode 27 rejects resource bundles that still say 9–13).
 *  4. Lets the Sentry debug-symbol upload fail without failing the build (local builds have no
 *     Sentry auth token; EAS sets SENTRY_DISABLE_AUTO_UPLOAD itself).
 *
 * Everything is idempotent, so `expo prebuild` can run it repeatedly.
 */
const fs = require('fs');
const path = require('path');
const { withInfoPlist, withAppDelegate, withDangerousMod } = require('expo/config-plugins');

// Each file gets the tag in its own comment syntax: `//` in Swift, `#` in the Podfile (Ruby) and
// .xcode.env (shell). A `//` line in either of those breaks pod install and Xcode's script phases.
const TAG = '[withIosSceneLifecycle]';
const SWIFT_MARK = `// ${TAG}`;
const HASH_MARK = `# ${TAG}`;

const SCENE_DELEGATE = `
${SWIFT_MARK} UIScene lifecycle (required by the iOS 27 SDK). See plugins/withIosSceneLifecycle.js.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  private var appDelegate: AppDelegate? { UIApplication.shared.delegate as? AppDelegate }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    // React Native (and the dev launcher) already set up this window at launch; move it onto the scene.
    let window = appDelegate?.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    window.makeKeyAndVisible()
    self.window = window
    appDelegate?.window = window

    // Opened from a link or a universal link while the app was not running.
    for context in connectionOptions.urlContexts {
      openURL(context)
    }
    for activity in connectionOptions.userActivities {
      continueActivity(activity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      openURL(context)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    continueActivity(userActivity)
  }

  private func openURL(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    options[.sourceApplication] = context.options.sourceApplication
    options[.annotation] = context.options.annotation
    options[.openInPlace] = context.options.openInPlace
    _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
  }

  private func continueActivity(_ activity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
  }
}
`;

const withSceneManifest = config =>
  withInfoPlist(config, cfg => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

const withSceneDelegate = config =>
  withAppDelegate(config, cfg => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('withIosSceneLifecycle expects a Swift AppDelegate (Expo SDK 53+).');
    }
    if (!cfg.modResults.contents.includes(TAG)) {
      cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${SCENE_DELEGATE}`;
    }
    return cfg;
  });

const PODFILE_SNIPPET = `
    ${HASH_MARK} Xcode 27 refuses pod targets below iOS 15 (some resource bundles still say 9-13).
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |bc|
        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.1
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        end
      end
    end`;

const XCODE_ENV_SNIPPET = `
${HASH_MARK} A missing Sentry auth token must not fail local builds (EAS disables uploads itself).
export SENTRY_ALLOW_FAILURE=\${SENTRY_ALLOW_FAILURE:-true}
`;

const withBuildFixes = config =>
  withDangerousMod(config, [
    'ios',
    cfg => {
      const iosDir = cfg.modRequest.platformProjectRoot;

      // Earlier versions of this plugin wrote `// [withIosSceneLifecycle]` here; turn it into a `#` comment.
      const fixLegacyMark = text => text.split(`// ${TAG}`).join(HASH_MARK);

      const podfile = path.join(iosDir, 'Podfile');
      let pods = fixLegacyMark(fs.readFileSync(podfile, 'utf8'));
      if (!pods.includes(TAG)) {
        // Insert at the end of the post_install block, after react_native_post_install(...).
        const anchor = /(react_native_post_install\([\s\S]*?\n\s*\))/;
        if (!anchor.test(pods)) throw new Error('withIosSceneLifecycle: could not find react_native_post_install in Podfile');
        pods = pods.replace(anchor, `$1\n${PODFILE_SNIPPET}`);
      }
      fs.writeFileSync(podfile, pods);

      const xcodeEnv = path.join(iosDir, '.xcode.env');
      let env = fixLegacyMark(fs.existsSync(xcodeEnv) ? fs.readFileSync(xcodeEnv, 'utf8') : '');
      if (!env.includes(TAG)) env = `${env.trimEnd()}\n${XCODE_ENV_SNIPPET}`;
      fs.writeFileSync(xcodeEnv, env);

      return cfg;
    },
  ]);

module.exports = config => withBuildFixes(withSceneDelegate(withSceneManifest(config)));
