"use client";

/**
 * Pemilih project, layar pertama setelah masuk.
 *
 * Satu pemasangan melayani beberapa project, dan hampir seluruh layar menyaring
 * datanya menurut project yang sedang dikerjakan. Pilihan itu diminta di muka,
 * bukan disisipkan sebagai penyaring di tiap layar: yang lupa menggantinya akan
 * mengajukan klaim project A memakai data project B, dan tidak ada apa pun pada
 * layar klaim yang akan memberitahunya.
 *
 * Pilihannya menempel pada sesi di server, bukan pada peramban — penyaringannya
 * dilakukan server, dan pilihan yang hanya hidup di peramban berarti server
 * tetap harus mempercayai apa yang dikirimkan layar.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Logo, LogoProject } from "../logo";

type Project = {
  id: string; slug: string; name: string; company_name: string;
};

export default function PilihProjectPage() {
  const [daftar, setDaftar] = useState<Project[]>([]);
  const [dipilih, setDipilih] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  // Lintasan tujuan dibaca dari alamatnya sendiri, bukan lewat useSearchParams:
  // halaman ini statis, dan hook itu menuntut batas Suspense hanya demi satu
  // parameter yang sudah tersedia di window.
  const lanjut = useCallback(() => {
    const n = new URLSearchParams(window.location.search).get("next") ?? "/klaim";
    location.href = n.startsWith("/") && !n.startsWith("//") ? n : "/klaim";
  }, []);

  useEffect(() => {
    fetch("/api/projects")
      .then(async (r) => {
        if (r.status === 401) { location.href = "/login"; return; }
        const b = await r.json();
        setDaftar(b.projects ?? []);
        setDipilih(b.dipilih ?? null);
      })
      .catch((e) => setGalat(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, []);

  /**
   * Yang terakhir dikerjakan dimajukan ke depan.
   *
   * Bukan sekadar urutan: kartu pertama diberi petak dua kali dua di kisinya,
   * dan petak itu hanya masuk akal di sudut kiri atas. Delapan dari sepuluh
   * kali orang membuka layar ini untuk kembali ke project yang sama seperti
   * kemarin — itulah yang pantas mendapat kartu terbesar.
   */
  const urut = useMemo(
    () => [...daftar.filter((p) => p.id === dipilih),
           ...daftar.filter((p) => p.id !== dipilih)],
    [daftar, dipilih]);

  const pilih = async (slug: string) => {
    setBusy(true); setGalat(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }) });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      lanjut();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
      setBusy(false);
    }
  };

  return (
    <div className="pilih-project">
      <header>
        {/* Lambang penuh, bersama tulisan "CIPTA HARMONI LESTARI" di bawahnya.
            Di kolom menu yang sempit tulisan itu mengecil menjadi coretan yang
            tidak terbaca, jadi di sana dipakai lambangnya saja — tetapi di sini
            ruangnya lapang, dan ini layar pertama sesudah masuk: tempat yang
            tepat untuk lambang perusahaan tampil utuh. */}
        <Logo tinggi={132} />
        <h1>Pilih Kategori Proyek</h1>
      </header>

      {galat && <div className="banner stop">{galat}</div>}

      <div className="pilihan">
        {urut.map((p) => (
          <button key={p.slug} disabled={busy}
                  className={"opsi kartu-project" +
                             (p.id === dipilih ? " terakhir" : "")}
                  onClick={() => void pilih(p.slug)}>
            {/* Bidang lambang setinggi tetap, lambang dipusatkan di dalamnya.
                Keenamnya berbeda jauh bentuknya — ada yang melebar sampai
                empat kali tingginya, ada yang menjulang — dan bila masing-
                masing hanya ditaruh di atas namanya, tidak ada satu pun garis
                yang sejajar di seluruh kisi. Bidang bertinggi tetap memberi
                keenamnya satu sumbu yang sama. */}
            <span className="lambang">
              <LogoProject slug={p.slug} tinggi={54} alt={p.name}
                           gantiTeks={p.name} />
            </span>
            {/* Hanya nama PT yang ditulis. Nama project-nya sendiri sudah
                terbaca di dalam lambangnya — keenam lambang ini membawa
                namanya masing-masing — jadi menuliskannya lagi tepat di
                bawahnya hanya mengulang. Nama PT tidak: ia tidak ada di
                lambang mana pun, dan ia yang membedakan project di bawah PT
                yang berlainan. */}
            <span className="nama">{p.company_name}</span>
          </button>
        ))}
        {!urut.length && !busy && (
          <div className="banner warn">
            <b>Belum ada project</b>
            Jalankan migrasi basis data lebih dulu.
          </div>
        )}
      </div>
    </div>
  );
}
