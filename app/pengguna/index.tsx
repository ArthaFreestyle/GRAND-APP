/**
 * Pengguna — the user list, and issue #42's whole reason for being: employee
 * accounts today can only be made by a seeder or a tool outside this app.
 *
 * **The one section in the app where the door itself has to be role-gated,
 * not only the write.** `contracts/openapi.yaml:89` reads `user` and `role` as
 * `SUPERADMIN`-only "termasuk untuk membaca" — so `GET /user` answers 403 for
 * INVENTARIS and CASHIER, and drawing this screen for them at all would be a
 * page whose only content is a failed request. `useCanWrite('user')` doubles
 * as that gate here: `services/permissions.ts` names `user`'s owner as
 * `SUPERADMIN` alone, so the flag is true for exactly the role that can read
 * this list in the first place.
 *
 * Reached from Profil's "Administrasi" group, drawn only for that same role —
 * but the guard below is what actually matters, because a hidden row in
 * Profil does not stop a deep link to `/pengguna`.
 */
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';

import {
  RamahBadge,
  RamahChip,
  RamahEmptySearch,
  RamahHeader,
  RamahInlineError,
  RamahPrimaryButton,
  RamahSearchField,
  RamahSecondaryButton,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { listPengguna, penggunaBus, type GrantRow, type PenggunaRow } from '@/services/pengguna';
import { roleLabel, useCanWrite } from '@/services/permissions';
import { listRole, type RoleRow } from '@/services/role';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function grantSummary(grants: GrantRow[]): string {
  if (grants.length === 0) return 'Belum ada wewenang';
  if (grants.length > 2) return `${grants.length} wewenang`;
  return grants
    .map((g) => (g.namaUnitKerja ? `${roleLabel(g.namaRole)} · ${g.namaUnitKerja}` : roleLabel(g.namaRole)))
    .join(', ');
}

export default function PenggunaListScreen() {
  const router = useRouter();
  const authorized = useCanWrite('user');
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  if (!authorized) return <TidakBerwenang onBack={goBack} />;
  return <PenggunaList onBack={goBack} dockPad={dockPad} />;
}

/**
 * The section's own "tidak berwenang" page (see `_layout.tsx`'s header). Not
 * a toast over a blank list — the read never happens at all, so there is
 * nothing behind this sentence to half-show.
 */
function TidakBerwenang({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.screen}>
      <RamahHeader title="Pengguna" onBack={onBack} />
      <View style={styles.center}>
        <Feather name="lock" size={32} color={C.iconMuted} />
        <Text style={styles.centerTitle}>Tidak berwenang</Text>
        <Text style={styles.centerSub}>
          Manajemen pengguna hanya bisa dibuka oleh superadmin.
        </Text>
        <View style={styles.centerAction}>
          <RamahSecondaryButton label="Kembali" onPress={onBack} />
        </View>
      </View>
    </View>
  );
}

function PenggunaList({ onBack, dockPad }: { onBack: () => void; dockPad: number }) {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<number | null>(null);
  const [termasukNonaktif, setTermasukNonaktif] = useState(false);

  const [roles, setRoles] = useState<RoleRow[]>([]);

  const [rows, setRows] = useState<PenggunaRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${search}|${roleFilter}|${termasukNonaktif}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  // The three role names are a short, fixed table — read once, kept for the
  // life of the screen, the same way the grant editor reads it fresh each time
  // it opens rather than caching it anywhere shared.
  useEffect(() => {
    let alive = true;
    listRole({ is_aktif: true, size: 50 })
      .then((r) => {
        if (alive) setRoles(r.data);
      })
      .catch(() => {
        // A failed role read only costs the filter chips; the list itself
        // does not depend on it.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listPengguna({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: termasukNonaktif ? undefined : true,
          role_id: roleFilter ?? undefined,
        });
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar pengguna.'));
      } finally {
        if (!alive) return;
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [search, roleFilter, termasukNonaktif, reloadToken, requestKey]);

  useRecordBus(penggunaBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    if (!saved.aktif && !termasukNonaktif) {
      setRows((list) => list.filter((r) => r.id !== saved.id));
      return;
    }
    setRows((list) => (list.some((r) => r.id === saved.id) ? list.map((r) => (r.id === saved.id ? saved : r)) : list));
  });

  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listPengguna({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: termasukNonaktif ? undefined : true,
          role_id: roleFilter ?? undefined,
        });
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...answer.data.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, answer.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, loading, hasMore, moreErr, page, search, roleFilter, termasukNonaktif]
  );

  const renderRow = useCallback(
    ({ item, index }: { item: PenggunaRow; index: number }) => (
      <PenggunaRowView
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={() => router.push({ pathname: '/pengguna/[id]', params: { id: item.id } })}
      />
    ),
    [rows.length, router]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title="Pengguna" onBack={onBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari username, nama, atau email"
            />
            <View style={styles.chipRow}>
              {roles.map((r) => (
                <RamahChip
                  key={r.id}
                  label={roleLabel(r.nama)}
                  selected={roleFilter === r.id}
                  onPress={() => setRoleFilter((cur) => (cur === r.id ? null : r.id))}
                />
              ))}
              <RamahChip
                label="Termasuk nonaktif"
                selected={termasukNonaktif}
                onPress={() => setTermasukNonaktif((v) => !v)}
                accessibilityLabel={
                  termasukNonaktif ? 'Sembunyikan pengguna nonaktif' : 'Tampilkan juga pengguna nonaktif'
                }
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <Placeholder loading={loading} error={listErr} searching={search !== ''} onRetry={reload} />
        }
        ListFooterComponent={<Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />}
      />

      <View style={[styles.dock, { paddingBottom: dockPad }]}>
        <RamahPrimaryButton label="Tambah pengguna" icon="user-plus" onPress={() => router.push('/pengguna/baru')} />
      </View>
    </View>
  );
}

function PenggunaRowView({
  row,
  first,
  last,
  onPress,
}: {
  row: PenggunaRow;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  const title = row.namaLengkap || row.username;
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${title}${row.aktif ? '' : ', nonaktif'}`}
        style={[styles.row, down && styles.rowDown]}>
        <View style={styles.grow}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {title}
            </Text>
            {row.aktif ? null : <RamahBadge label="Nonaktif" tone="neutral" />}
          </View>
          <Text style={styles.rowSub} numberOfLines={1}>
            {row.username}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {grantSummary(row.grants)}
          </Text>
        </View>
        <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
      </Pressable>
    </View>
  );
}

function Placeholder({
  loading,
  error,
  searching,
  onRetry,
}: {
  loading: boolean;
  error: string;
  searching: boolean;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (loading)
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  if (searching)
    return (
      <View style={styles.placeholder}>
        <RamahEmptySearch sub="Coba kata kunci lain — username, nama, atau email." />
      </View>
    );
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Belum ada pengguna. Tambahkan satu untuk mulai.</Text>
    </View>
  );
}

function Footer({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  grow: { flex: 1, minWidth: 0 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.stack, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.grey50 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: L.space2 },
  rowTitle: { ...T.titleTiny, color: C.textTitle, flexShrink: 1 },
  rowSub: { ...T.bodySmall, color: C.textMuted, marginTop: L.inline },
  rowMeta: { ...T.bodySmall, color: C.textBody, marginTop: L.inline },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: L.space6, gap: L.space2 },
  centerTitle: { ...T.titleSmall, color: C.textTitle },
  centerSub: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  centerAction: { paddingTop: L.space4 },
});
