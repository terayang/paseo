import { useEffect, useRef, useState } from "react";
import { Dimensions, Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { isLargeScreenShortestSide } from "@/constants/form-factor";

function shortestScreenSide(): number {
  const { width, height } = Dimensions.get("screen");
  return Math.min(width, height);
}

// A landscape window on a portrait screen means the activity is not running
// full-screen on the device display: split-screen, freeform, or a virtual
// display sized by an external host (car head units mirroring phone apps,
// e.g. Xiaomi HyperConnect). Locking portrait there makes the host disable
// its fullscreen affordance — the window can never go landscape.
// The reverse case (portrait window on a landscape screen) is Android
// letterboxing a portrait-locked app on a rotated phone and must keep the
// lock, so the exemption only applies in this one direction.
function isFloatingLandscapeWindow(): boolean {
  const window = Dimensions.get("window");
  const screen = Dimensions.get("screen");
  return window.width > window.height && screen.width < screen.height;
}

// The orientation decision must read the full-display ("screen") size, not the
// window size: once a portrait lock is applied on a large display, Android
// letterboxes the activity into a narrow portrait window, and a window-based
// check would keep seeing a small window and never unlock (fold -> unfold
// deadlock). The screen size is unaffected by letterboxing and still changes
// on fold/unfold.
function useOrientationConstraints(): { isLargeScreen: boolean; isFloatingWindow: boolean } {
  const [constraints, setConstraints] = useState(() => ({
    isLargeScreen: isLargeScreenShortestSide(shortestScreenSide()),
    isFloatingWindow: isFloatingLandscapeWindow(),
  }));

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window, screen }) => {
      setConstraints({
        isLargeScreen: isLargeScreenShortestSide(Math.min(screen.width, screen.height)),
        isFloatingWindow: window.width > window.height && screen.width < screen.height,
      });
    });
    return () => subscription.remove();
  }, []);

  return constraints;
}

// Phones must stay portrait: in landscape a phone window is wide enough to
// cross the desktop layout breakpoint, which renders the desktop shell in a
// phone-sized window (crowded footer, compressed session list). Tablets and
// unfolded foldables keep free rotation — see getpaseo/paseo#1669 for the
// letterboxing this pairs with the with-android-rotation config plugin to fix.
// Android only: iOS keeps its static portrait lock from app.json (rotating the
// iPadOS app crashes it, see getpaseo/paseo#1030).
export function useAdaptiveOrientation(): void {
  const { isLargeScreen, isFloatingWindow } = useOrientationConstraints();
  // Resize events arrive continuously while a split-screen or free-form
  // window is being dragged, and each lock/unlock call makes Android re-layout
  // the whole activity. Remember the last applied state so only actual
  // transitions (phone <-> large screen) hit the native orientation API.
  const lastLockedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const shouldLock = !isLargeScreen && !isFloatingWindow;
    if (lastLockedRef.current === shouldLock) {
      return;
    }
    lastLockedRef.current = shouldLock;
    if (shouldLock) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      void ScreenOrientation.unlockAsync();
    }
  }, [isLargeScreen, isFloatingWindow]);
}
