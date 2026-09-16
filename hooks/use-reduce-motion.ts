/**
 * Whether the person has asked the OS for less motion.
 *
 * ## Why this exists at all
 *
 * The app draws three Lottie animations (isu #39), and every one of them sits
 * in a place somebody has to read rather than watch: an empty search result, a
 * green pill's arrow, the screen that says "do not leave while the photo is
 * being read". Motion in those three places is feedback, not decoration, which
 * is exactly why it has to be switchable off — a looping illustration is the
 * worst thing to put in front of someone with a vestibular disorder, and
 * "Kurangi Gerakan" / "Remove animations" is how they have already said so
 * before ever opening this app.
 *
 * It is a per-device accessibility switch, not a preference this app owns. There
 * is deliberately no setting for it in `app/(admin)/profil.tsx`: a second switch
 * would be a second answer to a question the OS has already asked once, and the
 * one that gets flipped is never the one the app happens to read.
 *
 * ## What each surface does with it
 *
 * Not "hide the animation" everywhere — the fallback belongs to the surface,
 * because what the motion was *saying* differs at each of the three:
 *
 * - **An empty search** falls back to a still frame of the same drawing
 *   (`RamahAnim.still`, a progress value picked per asset). The illustration is
 *   doing its whole job as a picture; only the loop is spent.
 * - **The green pill's arrow** falls back to a static Feather `arrow-right`. The
 *   arrow means "there is a screen after this one", and that promise survives
 *   without moving.
 * - **The OCR wait** falls back to `ActivityIndicator`, which is what that screen
 *   drew before the animation landed. A still picture of a delivery van cannot
 *   say "still working", and a platform spinner is both the convention for that
 *   sentence and small enough that reduce-motion settings do not target it.
 *
 * ## Reading it
 *
 * It answers `false` for the first frame or two while the native query settles,
 * then re-renders with the real value. That direction is deliberate: an
 * animation that starts and is cut short a frame later is a far smaller problem
 * than a still that never starts for everyone else, and there is no synchronous
 * form of this query on either platform to avoid the flash with.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    // Set by the listener, and read by the initial query when it lands. The
    // subscription is registered *before* the query is issued so a switch
    // flipped while the promise is in flight is not lost in the gap between the
    // two — and once it has fired, its value is the newer one and the promise
    // must not paint over it. Same generation problem every fetch in this app
    // has, with one request instead of a stream of them.
    let live = false;

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      live = true;
      setReduce(on);
    });

    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive && !live) setReduce(on);
    });

    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduce;
}
