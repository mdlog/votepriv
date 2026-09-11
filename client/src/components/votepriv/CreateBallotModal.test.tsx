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
  it("menolak submit ketika judul kosong, dan tidak memanggil onCreate atau onClose", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    // Judul awal sudah "" (useState default); kedua opsi sudah terisi bawaan,
    // jadi ini murni menguji cabang !title.trim() dari penjaga validasi.
    const { container } = render(<CreateBallotModal onClose={onClose} onCreate={onCreate} />);
    submit(container);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("menolak submit ketika salah satu opsi dikosongkan (whitespace saja)", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<CreateBallotModal onClose={onClose} onCreate={onCreate} />);
    const [judul, , opsiSatu] = inputs(container);
    fireEvent.change(judul, { target: { value: "Treasury allocation" } });
    fireEvent.change(opsiSatu, { target: { value: "   " } });
    submit(container);
    expect(onCreate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("memanggil onCreate dengan bentuk ballot yang benar lalu menutup modal ketika detail lengkap", () => {
    const onCreate = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<CreateBallotModal onClose={onClose} onCreate={onCreate} />);
    const [judul, community] = inputs(container);
    fireEvent.change(judul, { target: { value: "Treasury allocation" } });
    fireEvent.change(community, { target: { value: "Midnight Builders" } });
    submit(container);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Treasury allocation",
        community: "Midnight Builders",
        description: "A new community decision, ready for private voting.",
        votes: 0,
        eligible: 0,
        quorum: 50,
        deadline: "Oct 24, 2026",
        status: "live",
        options: ["Fund developer grants", "Host local meetups"],
        accent: "mint",
        tag: "New ballot",
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
});
