import { useEffect, useRef, useState } from "react";
import { Dimensions, Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { isLargeScreenShortestSide } from "@/constants/form-factor";

function shortestScreenSide(): number {
  const { width, height } = Dimensions.get("screen");
  return Math.min(width, height);
}

// The orientation decision must read the full-display ("screen") size, not the
// window size: once a portrait lock is applied on a large display, Android
// letterboxes the activity into a narrow portrait window, and a window-based
// check would keep seeing a small window and never unlock (fold -> unfold
// deadlock). The screen size is unaffected by letterboxing and still changes
// on fold/unfold.
function useIsLargeScreenByDisplay(): boolean {
  const [isLargeScreen, setIsLargeScreen] = useState(() =>
    isLargeScreenShortestSide(shortestScreenSide()),
  );

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ screen }) => {
      setIsLargeScreen(isLargeScreenShortestSide(Math.min(screen.width, screen.height)));
    });
    return () => subscription.remove();
  }, []);

  return isLargeScreen;
}

// Phones must stay portrait: in landscape a phone window is wide enough to
// cross the desktop layout breakpoint, which renders the desktop shell in a
// phone-sized window (crowded footer, compressed session list). Tablets and
// unfolded foldables keep free rotation — see getpaseo/paseo#1669 for the
// letterboxing this pairs with the with-android-rotation config plugin to fix.
// Android only: iOS keeps its static portrait lock from app.json (rotating the
// iPadOS app crashes it, see getpaseo/paseo#1030).
export function useAdaptiveOrientation(): void {
  const isLargeScreen = useIsLargeScreenByDisplay();
  // Resize events arrive continuously while a split-screen or free-form
  // window is being dragged, and each lock/unlock call makes Android re-layout
  // the whole activity. Remember the last applied state so only actual
  // transitions (phone <-> large screen) hit the native orientation API.
  const lastLockedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const shouldLock = !isLargeScreen;
    if (lastLockedRef.current === shouldLock) {
      return;
    }
    lastLockedRef.current = shouldLock;
    if (shouldLock) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    } else {
      void ScreenOrientation.unlockAsync();
    }
  }, [isLargeScreen]);
}
