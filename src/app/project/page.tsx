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

import { useCallback, useEffect, useState } from "react";

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
        <Logo tinggi={52} hanyaLambang />
        <div>
          <h1>Pilih project</h1>
          <p>
            Data penjualan, marketing, dan klaim terpisah per project. Yang Anda
            pilih di sini menentukan isi seluruh layar berikutnya.
          </p>
        </div>
      </header>

      {galat && <div className="banner stop">{galat}</div>}

      <div className="pilihan">
        {daftar.map((p) => (
          <button key={p.slug} className="opsi" disabled={busy}
                  onClick={() => void pilih(p.slug)}>
            {/* Lambang project di atas namanya. Semuanya berbeda jauh
                bentuknya — ada yang melebar, ada yang menjulang — jadi
                tingginya dipatok dan lebarnya mengikuti, supaya semua kartu
                tetap sejajar. Nama tetap ditulis di bawahnya: lambang saja
                menuntut orang mengenali semuanya dari ingatan. */}
            <LogoProject slug={p.slug} tinggi={56} alt="" />
            <b>{p.name}</b>
            <span>{p.company_name}</span>
            {p.id === dipilih && (
              <span className="pill ok" style={{ marginTop: 8 }}>
                terakhir dikerjakan
              </span>
            )}
          </button>
        ))}
        {!daftar.length && !busy && (
          <div className="banner warn">
            <b>Belum ada project</b>
            Jalankan migrasi basis data lebih dulu.
          </div>
        )}
      </div>
    </div>
  );
}
