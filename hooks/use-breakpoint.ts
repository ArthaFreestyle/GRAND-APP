import { useWindowDimensions } from 'react-native';

/**
 * Which layout a window qualifies for.
 *
 * Three classes, not a scale: past a certain width the fix is a different
 * arrangement — a sidebar beside the content instead of above it, three role
 * cards to a row instead of two — and stretching the phone layout to fill a
 * tablet is not the same thing.
 */
export type Breakpoint = 'phone' | 'tablet' | 'large';

const ORDER: Record<Breakpoint, number> = { phone: 0, tablet: 1, large: 2 };

/**
 * Width alone decides, never orientation. A tablet held upright is 820pt wide
 * and has room for the wider arrangement; a phone turned sideways is 660pt and
 * does not — asking `height >= width` gets both of those backwards.
 *
 * The boundaries are Material's window size classes (compact / medium /
 * expanded), which is also where the 900 that `produk.tsx` had been carrying
 * privately was aiming.
 */
export function breakpointOf(width: number): Breakpoint {
  if (width < 600) return 'phone';
  if (width < 905) return 'tablet';
  return 'large';
}

/** Re-renders on rotation, split-screen, and window resize. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return breakpointOf(width);
}

/**
 * `atLeast(bp, 'tablet')` — a plain function rather than something the hook
 * returns, so the breakpoint stays a string that is safe to put in a dependency
 * array.
 */
export function atLeast(bp: Breakpoint, min: Breakpoint): boolean {
  return ORDER[bp] >= ORDER[min];
}
