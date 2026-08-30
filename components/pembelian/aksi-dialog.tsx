/**
 * The confirmation in front of a workflow transition.
 *
 * Every one of the four is confirmed, which is not this project's usual habit —
 * `RecordList` runs reversible actions immediately and offers an undo instead.
 * None of these are reversible in that sense. `posting` appends to `kartu_stok`,
 * which is append-only: a wrong posting can only be reversed by a second
 * document that reverses it at today's moving average, in today's period. Even
 * `ajukan`, the mildest, locks the header and the lines against further editing.
 *
 * So the dialog says what the transition actually does rather than asking
 * "yakin?", and the two that need a reason collect it here — the contract makes
 * `alasan` and `alasan_batal` required precisely because a reversal nobody
 * explained cannot be told apart from a mistake, and `kartu_stok` keeps both
 * forever.
 */
import { View } from 'react-native';

import {
  ErrorBanner,
  Field,
  ModalFooter,
  ModalHead,
  ModalShell,
  TextField,
} from '@/components/shell/ui';
import { Text } from '@/components/ui/text';
import type { AksiDokumen } from '@/services/pembelian';

export function AksiDialog({
  aksi,
  alasan,
  onChangeAlasan,
  error,
  onCancel,
  onConfirm,
  busy,
}: {
  /** `null` closes the dialog; the caller keeps the chosen action. */
  aksi: AksiDokumen | null;
  alasan: string;
  onChangeAlasan: (v: string) => void;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <ModalShell visible={aksi !== null} width={520} onRequestClose={onCancel}>
      {aksi && (
        <>
          <ModalHead title={aksi.judul} sub={aksi.penjelasan} />
          <View style={{ padding: 20, gap: 14 }}>
            {aksi.alasanField ? (
              <Field label="Alasan" hint="Wajib, maksimal 500 karakter.">
                <TextField
                  value={alasan}
                  onChangeText={onChangeAlasan}
                  placeholder={
                    aksi.key === 'tolak'
                      ? 'Harga baris 3 tidak cocok dengan nota supplier'
                      : 'Barang dikembalikan seluruhnya, faktur salah supplier'
                  }
                  multiline
                />
              </Field>
            ) : (
              <Text className="text-[13.5px] leading-5 text-dark2">
                Tindakan ini dijalankan atas nama peran aktif Anda dan tercatat di dokumen.
              </Text>
            )}
            <ErrorBanner message={error} />
          </View>
          <ModalFooter
            onCancel={onCancel}
            onSave={onConfirm}
            saveLabel={busy ? 'Memproses…' : aksi.label}
          />
        </>
      )}
    </ModalShell>
  );
}
