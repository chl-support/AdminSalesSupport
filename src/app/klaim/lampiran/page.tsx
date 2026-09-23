"use client";

/**
 * Lampiran gabungan, dibuka siap cetak.
 *
 * Sebelumnya tombol Cetak membuka PDF lampirannya di tab tersendiri dan
 * berhenti di situ: formulirnya memunculkan dialog cetak, lampirannya tidak.
 * Yang mencetak lalu harus sadar sendiri bahwa tab itu masih menunggu Ctrl+P —
 * dan tab yang terlihat "sudah jadi" adalah tab yang ditinggalkan.
 *
 * Halaman ini membungkus PDF-nya dalam satu bingkai dan meminta peramban
 * mencetaknya begitu berkasnya selesai dimuat. Permintaan itu tidak selalu
 * dikabulkan — sebagian peramban menolak perintah cetak terhadap PDF yang
 * ditampilkan pembaca bawaannya — jadi tombolnya tetap ada di atas, beserta
 * kalimat yang menyebut Ctrl+P. Yang gagal otomatis tetap dapat dikerjakan,
 * dan yang mengerjakannya tahu caranya tanpa menebak.
 *
 * Tidak memakai useSearchParams: pada Next.js 16 ia menuntut Suspense dan
 * menggagalkan prerender statis halaman ini.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useKata } from "../../bahasa";
import { MemeriksaSesi } from "../../kerangka";
import { useSesi } from "../../session";

const KATA = {
  id: {
    judul: "Lampiran klaim",
    cetak: "Cetak lampiran",
    memuat: "Menyiapkan lampiran…",
    kosong: "Tidak ada lampiran yang diminta.",
    manual: "Bila dialog cetak tidak muncul sendiri, tekan tombol di atas " +
            "atau Ctrl+P (⌘P pada Mac).",
  },
  en: {
    judul: "Claim attachments",
    cetak: "Print the attachments",
    memuat: "Preparing the attachments…",
    kosong: "No attachments were requested.",
    manual: "If the print dialog does not appear on its own, use the button " +
            "above or press Ctrl+P (⌘P on a Mac).",
  },
};

export default function LampiranPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const bingkai = useRef<HTMLIFrameElement | null>(null);
  const [alamat, setAlamat] = useState<string | null>(null);
  /**
   * Bingkainya sudah memuat berkasnya.
   *
   * Hanya untuk menyembunyikan kalimat "menyiapkan"; tombolnya tidak pernah
   * dimatikan karenanya. Peristiwa `load` pada bingkai berisi PDF tidak selalu
   * datang — sebagian peramban menampilkan PDF lewat pembaca bawaannya dan
   * tidak mengabarkan apa pun — dan tombol yang menunggu kabar yang tidak
   * pernah datang adalah tombol yang mati selamanya.
   */
  const [siap, setSiap] = useState(false);

  // Kalimat "menyiapkan" hilang sendiri setelah beberapa saat, bukan hanya
  // saat `load` datang — lihat catatan pada `siap`.
  useEffect(() => {
    const t = setTimeout(() => setSiap(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const klaim = (q.get("klaim") ?? "").trim();
    const ids = (q.get("ids") ?? "").trim();
    if (!klaim || !ids) return;
    setAlamat(`/api/claims/${encodeURIComponent(klaim)}/lampiran-gabungan` +
              `?ids=${encodeURIComponent(ids)}`);
  }, []);

  /**
   * Minta peramban mencetak isi bingkainya.
   *
   * Dibungkus try/catch dan dibiarkan gagal diam-diam: pembaca PDF bawaan
   * sebagian peramban menolak perintah ini, dan galat di konsol tidak menolong
   * siapa pun. Yang menolong adalah tombol dan kalimat Ctrl+P di layar.
   */
  const cetak = useCallback(() => {
    try {
      const w = bingkai.current?.contentWindow;
      if (!w) return;
      w.focus();
      w.print();
    } catch { /* tombolnya tetap ada, begitu pula Ctrl+P */ }
  }, []);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <div className="lampiran-cetak">
      <div className="row sp jangan-cetak" style={{ margin: "10px 14px" }}>
        <b style={{ marginRight: "auto" }}>{k.judul}</b>
        <button className="pri" onClick={cetak}>{k.cetak}</button>
      </div>

      {!alamat ? (
        <p className="hint">{k.kosong}</p>
      ) : (
        <>
          {!siap && <p className="hint">{k.memuat}</p>}
          <iframe ref={bingkai} src={alamat} title={k.judul}
                  onLoad={() => { setSiap(true); setTimeout(cetak, 300); }} />
          <p className="hint jangan-cetak">{k.manual}</p>
        </>
      )}
    </div>
  );
}
