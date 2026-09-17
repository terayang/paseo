const { withAndroidManifest, withMainActivity } = require("expo/config-plugins");

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
function withRotationManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) {
      throw new Error("Could not unlock Android rotation without an application manifest entry");
    }
    for (const activity of application.activity ?? []) {
      if (activity.$?.["android:screenOrientation"]) {
        // fullUser (not unspecified): an explicit opt-in to all orientations.
        // A portrait-locked activity that lands on a landscape display (foldable
        // cover -> inner screen, car/freeform host) gets orientation-letterboxed,
        // and the letterbox sticks across unlock + recreate when the manifest
        // value is unspecified. fullUser lets the system expand the window.
        // fullSensor would also work but ignores the system rotation lock;
        // fullUser tracks the sensor the same way while honoring that lock.
        activity.$["android:screenOrientation"] = "fullUser";
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

// The orientation policy itself is applied natively in MainActivity. It was
// JS-side once (use-adaptive-orientation.ts on top of expo-screen-orientation),
// but React Native's Dimensions "screen" metrics go stale across foldable
// display switches (DisplayMetricsHolder only re-initializes on rotation
// changes), so after cover -> inner display the JS kept believing in a small
// portrait screen and re-asserted/kept the portrait lock while the system
// letterboxed the window — and vice versa on fold. The real display size is
// only reliably known natively.
const ADAPTIVE_ORIENTATION_IMPORTS = `import android.content.pm.ActivityInfo
import android.content.res.Configuration
import android.util.DisplayMetrics
`;

const ADAPTIVE_ORIENTATION_METHODS = `
  /**
   * Small displays (below the sw600dp tablet baseline) lock portrait; large
   * displays rotate freely. A landscape window on a portrait display is a
   * floating/freeform window hosted by an external surface (split-screen,
   * car head units mirroring phone apps, e.g. Xiaomi HyperConnect) and is
   * exempt — locking portrait there makes the host drop its fullscreen
   * affordance. The reverse mismatch (portrait window on a landscape
   * display) is orientation letterboxing and must keep the lock.
   */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    applyAdaptiveOrientation()
  }

  // Hot starts reach neither onCreate nor (reliably) onConfigurationChanged:
  // the cover -> inner display switch happens while the activity is stopped
  // on the launcher, so resume is where the stale portrait lock from the
  // cover screen must be re-evaluated.
  override fun onResume() {
    super.onResume()
    applyAdaptiveOrientation()
  }

  private fun applyAdaptiveOrientation() {
    val currentDisplay = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      display
    } else {
      @Suppress("DEPRECATION")
      windowManager.defaultDisplay
    }
    val metrics = DisplayMetrics()
    currentDisplay?.getRealMetrics(metrics) ?: return
    val smallestWidthDp = minOf(metrics.widthPixels, metrics.heightPixels) * 160 / metrics.densityDpi
    val displayPortrait = metrics.heightPixels >= metrics.widthPixels
    val windowLandscape = resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    requestedOrientation =
      if (smallestWidthDp >= 600 || (windowLandscape && displayPortrait)) {
        // fullUser (not fullSensor): same sensor-driven rotation, but honors
        // the system rotation lock instead of overriding it.
        ActivityInfo.SCREEN_ORIENTATION_FULL_USER
      } else {
        ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
      }
  }
`;

function replaceOnce(contents, anchor, replacement, what) {
  const first = contents.indexOf(anchor);
  if (first === -1 || contents.indexOf(anchor, first + anchor.length) !== -1) {
    throw new Error(`with-android-rotation: expected exactly one ${what} anchor in MainActivity`);
  }
  return contents.replace(anchor, replacement);
}

function withAdaptiveMainActivity(config) {
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") {
      throw new Error(
        "with-android-rotation: MainActivity is not Kotlin, cannot inject orientation policy",
      );
    }
    let contents = modConfig.modResults.contents;
    // Non-clean prebuilds re-run mods on the previously generated file.
    if (contents.includes("private fun applyAdaptiveOrientation()")) {
      return modConfig;
    }
    contents = replaceOnce(
      contents,
      "import android.os.Bundle\n",
      `import android.os.Bundle\n${ADAPTIVE_ORIENTATION_IMPORTS}`,
      "import",
    );
    contents = replaceOnce(
      contents,
      "super.onCreate(null)\n  }",
      "super.onCreate(null)\n    applyAdaptiveOrientation()\n  }",
      "onCreate",
    );
    if (!/\n}\s*$/.test(contents)) {
      throw new Error("with-android-rotation: could not find MainActivity class end");
    }
    contents = contents.replace(/\n}\s*$/, `${ADAPTIVE_ORIENTATION_METHODS}}\n`);
    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withAndroidRotationUnlocked(config) {
  return withAdaptiveMainActivity(withRotationManifest(config));
}

module.exports = withAndroidRotationUnlocked;
