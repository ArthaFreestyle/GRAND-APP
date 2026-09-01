import { Stack } from 'expo-router';

/**
 * Depth inside the section: `[id]` and `baru` pushed over `index`.
 *
 * The mirror of `penerimaan-susulan/_layout.tsx`, for the same reasons — the
 * list stays mounted under a pushed detail with its scroll and appended pages,
 * the back button pops back to it, and every record keeps a URL that can be deep
 * linked.
 *
 * The anchor is what a cold deep link needs, including the one this section gets
 * most often: `/retur-pembelian/baru?idPembelian=…` pressed from an invoice.
 */
export const unstable_settings = { anchor: 'index' };

export default function ReturPembelianLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Retur Pembelian', animation: 'none' }} />
      <Stack.Screen
        name="[id]"
        options={{ title: 'Detail Retur Pembelian', animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="baru"
        options={{ title: 'Retur Pembelian Baru', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
