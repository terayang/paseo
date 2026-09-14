import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useIsLargeScreenForm } from "@/constants/layout";

// Phones must stay portrait: in landscape a phone window is wide enough to
// cross the desktop layout breakpoint, which renders the desktop shell in a
// phone-sized window (crowded footer, compressed session list). Tablets and
// unfolded foldables keep free rotation — see getpaseo/paseo#1669 for the
// letterboxing this pairs with the with-android-rotation config plugin to fix.
// Android only: iOS keeps its static portrait lock from app.json (rotating the
// iPadOS app crashes it, see getpaseo/paseo#1030).
export function useAdaptiveOrientation(): void {
  const isLargeScreen = useIsLargeScreenForm();
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
