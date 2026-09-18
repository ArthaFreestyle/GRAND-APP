/**
 * The wewenang (grant) editor — `baru.tsx` and `ubah.tsx`'s shared way of
 * building the `grants` array `PATCH /user/{id}` and `POST /user` both take.
 *
 * **This holds the whole set, never a diff.** §0.2 of issue #42 is explicit:
 * `grants` on the wire *replaces* everything a user holds, so a caller that
 * sent "the grants that changed" would silently drop every one it left out.
 * `values`/`onChange` here follow the same controlled-array shape the rest of
 * this app uses for a list somebody edits in place — the parent form owns the
 * array, this component only ever hands back a full next one.
 *
 * **One grant is a `(role, unit kerja)` pair**, added through two sheets in
 * sequence rather than one combined picker: `LayarGudang.dc.html` never draws
 * this control at all (it is new with #42, not ported from the board), and a
 * phone-width sheet has no room to show thirty units next to three roles at
 * once. "Seluruh unit" sits above the fetched list as its own option, because
 * `id_unit_kerja: null` is a real, first-class choice — the SUPERADMIN shape —
 * not the absence of one.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  RamahIconButton,
  RamahInlineError,
  RamahSecondaryButton,
  RamahSectionHeader,
  RamahSheet,
  RamahSheetOption,
  RamahStackCard,
} from '@/components/shell/ramah';
import { RamahColors as C, RamahLayout as L, RamahType as T } from '@/constants/theme-ramah';
import { messageOf } from '@/services/api';
import { roleLabel } from '@/services/permissions';
import { listRole, type RoleRow } from '@/services/role';
import { listUnitKerja, type UnitKerjaRow } from '@/services/unit-kerja';
import type { GrantInput } from '@/services/pengguna';

/** One row of the editor's own state — enough to both display a grant and rebuild the wire body from it. */
export interface GrantValue {
  idRole: number;
  namaRole: string;
  idUnitKerja: number | null;
  namaUnitKerja: string | null;
}

/** The contract caps a user at 32 grants (§0.3). */
export const GRANT_LIMIT = 32;

export function grantsBody(values: readonly GrantValue[]): GrantInput[] {
  return values.map((g) => ({ id_role: g.idRole, id_unit_kerja: g.idUnitKerja }));
}

function grantLabel(v: GrantValue): string {
  return v.namaUnitKerja ? `${roleLabel(v.namaRole)} · ${v.namaUnitKerja}` : roleLabel(v.namaRole);
}

export function GrantEditor({
  values,
  onChange,
}: {
  values: GrantValue[];
  onChange: (next: GrantValue[]) => void;
}) {
  const [pickingRole, setPickingRole] = useState(false);
  const [pickingUnit, setPickingUnit] = useState(false);
  const [pendingRole, setPendingRole] = useState<RoleRow | null>(null);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [rolesErr, setRolesErr] = useState('');
  const [units, setUnits] = useState<UnitKerjaRow[]>([]);
  const [unitsErr, setUnitsErr] = useState('');

  // Read once per opening rather than kept warm: both master tables are short
  // (a handful of roles, a handful of unit kerja) and this sheet opens rarely
  // enough that a fresh read costs nothing and can never go stale mid-edit.
  useEffect(() => {
    if (!pickingRole) return;
    let alive = true;
    listRole({ is_aktif: true, size: 50 })
      .then((r) => {
        if (alive) {
          setRoles(r.data);
          setRolesErr('');
        }
      })
      .catch((e) => {
        if (alive) setRolesErr(messageOf(e, 'Gagal memuat daftar role.'));
      });
    return () => {
      alive = false;
    };
  }, [pickingRole]);

  useEffect(() => {
    if (!pickingUnit) return;
    let alive = true;
    listUnitKerja({ is_aktif: true, size: 100 })
      .then((r) => {
        if (alive) {
          setUnits(r.data);
          setUnitsErr('');
        }
      })
      .catch((e) => {
        if (alive) setUnitsErr(messageOf(e, 'Gagal memuat daftar unit kerja.'));
      });
    return () => {
      alive = false;
    };
  }, [pickingUnit]);

  function pickRole(role: RoleRow) {
    setPendingRole(role);
    setPickingRole(false);
    setPickingUnit(true);
  }

  function pickUnit(unit: UnitKerjaRow | null) {
    setPickingUnit(false);
    const role = pendingRole;
    setPendingRole(null);
    if (!role) return;
    // A repeated (role, unit) pair is one grant, not two — adding it again is
    // a no-op rather than a duplicate row nobody asked for.
    const exists = values.some((g) => g.idRole === role.id && g.idUnitKerja === (unit?.id ?? null));
    if (exists) return;
    onChange([
      ...values,
      { idRole: role.id, namaRole: role.nama, idUnitKerja: unit?.id ?? null, namaUnitKerja: unit?.nama ?? null },
    ]);
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <View style={styles.wrap}>
      <RamahSectionHeader>Wewenang</RamahSectionHeader>

      {values.length === 0 ? (
        <Text style={styles.empty}>Belum ada wewenang. Tambahkan minimal satu.</Text>
      ) : (
        <RamahStackCard>
          {values.map((g, i) => (
            <View key={`${g.idRole}-${g.idUnitKerja}`} style={styles.row}>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {grantLabel(g)}
              </Text>
              <RamahIconButton icon="x" label={`Hapus wewenang ${grantLabel(g)}`} onPress={() => remove(i)} />
            </View>
          ))}
        </RamahStackCard>
      )}

      <RamahSecondaryButton
        label="Tambah wewenang"
        icon="plus"
        onPress={() => setPickingRole(true)}
        disabled={values.length >= GRANT_LIMIT}
      />

      <RamahSheet visible={pickingRole} title="Pilih role" onClose={() => setPickingRole(false)}>
        <View style={styles.sheetBody}>
          {rolesErr ? (
            <RamahInlineError message={rolesErr} />
          ) : (
            roles.map((r) => (
              <RamahSheetOption key={r.id} label={roleLabel(r.nama)} selected={false} onPress={() => pickRole(r)} />
            ))
          )}
        </View>
      </RamahSheet>

      <RamahSheet
        visible={pickingUnit}
        title="Pilih unit kerja"
        onClose={() => {
          setPickingUnit(false);
          setPendingRole(null);
        }}>
        <View style={styles.sheetBody}>
          <RamahSheetOption label="Seluruh unit" selected={false} onPress={() => pickUnit(null)} />
          {unitsErr ? (
            <RamahInlineError message={unitsErr} />
          ) : (
            units.map((u) => (
              <RamahSheetOption key={u.id} label={u.nama} selected={false} onPress={() => pickUnit(u)} />
            ))
          )}
        </View>
      </RamahSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: L.related },
  empty: { ...T.bodySmall, color: C.textBody },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowLabel: { ...T.titleTiny, color: C.textTitle, flex: 1, minWidth: 0 },
  sheetBody: { paddingHorizontal: L.gutter, gap: L.space1, paddingBottom: L.space4 },
});
