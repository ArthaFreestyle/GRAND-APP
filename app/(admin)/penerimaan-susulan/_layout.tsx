import { Stack } from 'expo-router';

/**
 * Depth inside the section: `[id]` and `baru` pushed over `index`.
 *
 * Identical in shape to `pembelian/_layout.tsx`, and deliberately so — the
 * reasons are the section's, not the document's: the list stays mounted under a
 * pushed detail with its scroll and appended pages, the back button pops back to
 * it, and every record keeps a URL that can be deep linked.
 *
 * Only the depth routes animate. `index` is the drawer's screen for this
 * section, so it arrives by whatever the drawer does.
 *
 * The anchor is what a cold deep link needs — including the one this section
 * gets most often, `/penerimaan-susulan/baru?idPembelian=…` pressed from an
 * invoice: dismissing it lands on this list rather than leaving the app.
 */
export const unstable_settings = { anchor: 'index' };

export default function PenerimaanSusulanLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Penerimaan Susulan', animation: 'none' }} />
      <Stack.Screen
        name="[id]"
        options={{ title: 'Detail Penerimaan Susulan', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="baru"
        options={{ title: 'Penerimaan Susulan Baru', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
