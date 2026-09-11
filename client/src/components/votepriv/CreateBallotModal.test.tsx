import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateBallotModal } from "./CreateBallotModal";

afterEach(() => cleanup());

// Urutan DOM di .form-stack: judul, community, lalu dua opsi di dalam
// .form-grid bersarang. querySelectorAll menjangkau turunan bersarang juga,
// jadi urutannya tetap judul, community, opsi satu, opsi dua.
function inputs(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLInputElement>(".form-stack input"));
}

function submit(container: HTMLElement) {
  fireEvent.click(container.querySelector<HTMLElement>(".modal-actions .primary-button")!);
}

describe("CreateBallotModal", () => {
  it("menolak submit ketika judul kosong, dan tidak menutup modal", () => {
    const onClose = vi.fn();
    // Judul awal sudah "" (useState default); kedua opsi sudah terisi bawaan,
    // jadi ini murni menguji cabang !title.trim() dari penjaga validasi.
    const { container } = render(<CreateBallotModal onClose={onClose} />);
    submit(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("menolak submit ketika salah satu opsi dikosongkan (whitespace saja)", () => {
    const onClose = vi.fn();
    const { container } = render(<CreateBallotModal onClose={onClose} />);
    const [judul, , opsiSatu] = inputs(container);
    fireEvent.change(judul, { target: { value: "Treasury allocation" } });
    fireEvent.change(opsiSatu, { target: { value: "   " } });
    submit(container);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Step 9: TIDAK ADA lagi ballot yang lahir — submit dengan detail lengkap hanya menutup modal", () => {
    // C-2a Task 8 Step 9: onCreate dicabut. Deploy sungguhan adalah C-2b, dan
    // membuat Ballot lokal di sini akan hilang pada muat ulang berikutnya
    // karena daftar sekarang dibaca dari registry on-chain. Satu-satunya
    // efek submit yang SAH sekarang adalah menutup modal — tidak ada tempat
    // lagi bagi uji ini untuk mengassert "ballot baru muncul".
    const onClose = vi.fn();
    const { container } = render(<CreateBallotModal onClose={onClose} />);
    const [judul, community] = inputs(container);
    fireEvent.change(judul, { target: { value: "Treasury allocation" } });
    fireEvent.change(community, { target: { value: "Midnight Builders" } });
    submit(container);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("formulir tetap dipertahankan apa adanya — bukan dihapus", () => {
    // C-2b akan mengisi formulir ini; menghapusnya berarti menulis ulang
    // markupnya nanti. Uji ini menjaga bahwa keempat input masih ada.
    const { container } = render(<CreateBallotModal onClose={() => {}} />);
    expect(inputs(container)).toHaveLength(4);
  });
});
