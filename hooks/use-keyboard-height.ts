/**
 * How much of the screen the keyboard is currently covering, in points.
 *
 * ## Why this has to be measured rather than avoided
 *
 * The usual advice — wrap the form in a `KeyboardAvoidingView` with
 * `behavior={undefined}` on Android — **does nothing in this app**, and the
 * reason is edge-to-edge. Under `decorFitsSystemWindows = false`, which is
 * simply how Android is now and no longer even a config key, the window is
 * *not* resized when the IME opens: the app keeps drawing at full height behind
 * it and the keyboard arrives as an inset the app is expected to consume itself.
 * `KeyboardAvoidingView` with no `behavior` relies on the window having already
 * shrunk, so on this app it is an empty wrapper and anything docked at the
 * bottom of the screen is simply covered with no way to reach it.
 *
 * `app/index.tsx` worked this out first, on the login screen, where the "Masuk"
 * button was unreachable. This hook is that solution lifted out of it so the
 * sheets and the docked buttons can share it instead of each rediscovering it.
 * The login screen keeps its own inline copy for now: it pairs the measurement
 * with an iOS `KeyboardAvoidingView` and it is a screen that has been run and
 * verified, which is not worth disturbing to save six lines.
 *
 * ## What this does **not** do
 *
 * It keeps a **docked** control and a bottom **sheet** clear of the keyboard.
 * It does not scroll a focused field that is halfway down a long form into view
 * — Android's native ScrollView does that on its own once the scroll view's
 * bounds are correct, which they now are, but iOS does not, and neither
 * platform does it inside a `Modal` reliably. `KeyboardAwareScrollView` from
 * `react-native-keyboard-controller` is the answer to that specific gap, and
 * Expo's keyboard guide recommends it for exactly this case.
 *
 * ## What it listens to, and why the event differs per platform
 *
 * iOS emits `keyboardWillShow` **before** the animation, with the final frame
 * already in the payload, so a layout driven from it moves with the keyboard
 * rather than after it. Android has no reliable `Will` event — it fires
 * inconsistently across OEM keyboards and is documented as unavailable on older
 * versions — so `Did` is what there is, and the layout lands one frame after the
 * keyboard has finished. That is visible if you look for it and is the honest
 * ceiling of the built-in APIs.
 *
 * **If that jump ever needs to go**, the answer is not more listeners: it is
 * `react-native-keyboard-controller`, which Expo's own keyboard guide points to
 * for exactly this, and whose `useKeyboardHandler` reports the height on every
 * frame of the animation. It needs a native rebuild and `KeyboardProvider` at
 * the root, so it is a deliberate step rather than something to add quietly.
 *
 * ## Reading it
 *
 * It is 0 whenever the keyboard is closed, which is most of the time, so a
 * caller can treat it as "extra space needed at the bottom" with no branching.
 * A **docked** control should *replace* its safe-area bottom inset with this
 * value rather than adding to it: while the keyboard is up, the gesture bar it
 * was padding for is behind the keyboard, and paying for both leaves a visible
 * strip of page colour between the button and the keys.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}

/**
 * The bottom padding a docked control should use, keyboard included.
 *
 * The two values are alternatives, never a sum. `insets.bottom` exists to keep a
 * button clear of the gesture bar; once the keyboard is open that bar is behind
 * the keyboard, so adding both pushes the button up by a strip of nothing.
 *
 * `gap` is the control's own breathing room above the edge, and it is kept in
 * both cases — a pill flush against the top of the keyboard reads as clipped.
 */
export function useDockPadding(insetBottom: number, gap: number): number {
  const keyboard = useKeyboardHeight();
  return (keyboard > 0 ? keyboard : insetBottom) + gap;
}
