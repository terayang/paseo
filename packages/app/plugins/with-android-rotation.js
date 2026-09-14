const { withAndroidManifest } = require("expo/config-plugins");

// The global `orientation` field stays "portrait" so iOS keeps its static
// lock (rotating the iPadOS app crashes it, see getpaseo/paseo#1030). On
// Android that same declaration letterboxes the app into a phone-sized
// window on landscape tablets (getpaseo/paseo#1669), so re-write the
// activities to follow the system instead.
//
// resizeableActivity is declared explicitly: it defaults to true at our
// targetSdk, but external-display/multi-window hosts (car head units running
// phone apps in freeform windows, e.g. Xiaomi HyperConnect) gate features
// like fullscreen on the declared value.
//
// smallestScreenSize is added to configChanges: folding/unfolding a foldable
// changes the smallest screen width, and without the flag Android recreates
// the activity on every fold, dropping in-flight UI state.
//
// This must run inside a manifest mod: custom plugins register their mods
// before Expo's withDefaultPlugins, and mod chains execute outside-in, so
// this modification lands last and wins over the built-in portrait write.
function withAndroidRotationUnlocked(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error("Could not unlock Android rotation without an application manifest entry");
    }
    for (const activity of application.activity ?? []) {
      if (activity.$?.["android:screenOrientation"]) {
        activity.$["android:screenOrientation"] = "unspecified";
        activity.$["android:resizeableActivity"] = "true";
        const configChanges = activity.$["android:configChanges"];
        if (typeof configChanges === "string" && !configChanges.includes("smallestScreenSize")) {
          activity.$["android:configChanges"] = `${configChanges}|smallestScreenSize`;
        }
      }
    }
    return modConfig;
  });
}

module.exports = withAndroidRotationUnlocked;
