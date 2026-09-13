#!/usr/bin/env bash
# Membuang HANYA baris trailer atribusi AI dari pesan commit yang masuk lewat
# stdin. Dipakai sebagai --msg-filter untuk git filter-branch (sekali, sebelum
# push pertama) dan dapat dipakai ulang oleh hook commit-msg. Isi berkas tidak
# pernah disentuh — hanya teks pesan.
grep -viE '^(Co-Authored-By:.*Claude|Claude-Session:|🤖 Generated with \[Claude Code\]|https://claude\.ai/code/session_)' \
| sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
