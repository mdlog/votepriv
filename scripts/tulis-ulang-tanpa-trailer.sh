#!/usr/bin/env bash
# Sekali pakai, SEBELUM push pertama: tulis ulang pesan commit di main dan
# feat/fondasi-kontrak tanpa trailer atribusi AI. Isi berkas tidak disentuh.
# Backup: refs/backup/sebelum-bersih-{feat,main} (dibuat sebelum skrip ini).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
FILTER="$PWD/scripts/bersihkan-trailer.sh"
[ -x "$FILTER" ] || { echo "filter tidak ditemukan/executable: $FILTER" >&2; exit 1; }
export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --msg-filter "$FILTER" -- main feat/fondasi-kontrak
echo
echo "=== verifikasi ==="
echo "  trailer di feat : $(git log feat/fondasi-kontrak --format='%B' | grep -ciE 'co-authored-by|claude-session|generated with' || true)"
echo "  trailer di main : $(git log main --format='%B' | grep -ciE 'co-authored-by|claude-session|generated with' || true)"
echo "  jumlah commit   : $(git rev-list --count feat/fondasi-kontrak)  (harus 132)"
echo "  isi pohon beda  : $(git diff --stat refs/backup/sebelum-bersih-feat HEAD | wc -l) berkas (harus 0)"
