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

import { grupDari, type GrupProject } from "@/lib/project-grup";
import { hanyaPricelist, layarBoleh } from "@/lib/project-terbatas";
import { useCallback, useEffect, useState } from "react";

import { Logo, LogoProject } from "../logo";

type Project = {
  id: string; slug: string; name: string; company_name: string;
};

/**
 * Daftar kartu: project biasa apa adanya, dan cluster sebuah grup diganti
 * satu kartu induk di tempat cluster pertamanya.
 */
type Kartu = Project | { grup: GrupProject; company_name: string };
function tampilan(daftar: Project[]): Kartu[] {
  const sudah = new Set<string>();
  return daftar.flatMap((p): Kartu[] => {
    const g = grupDari(p.slug);
    if (!g) return [p];
    if (sudah.has(g.slug)) return [];
    sudah.add(g.slug);
    return [{ grup: g, company_name: p.company_name }];
  });
}

export default function PilihProjectPage() {
  const [daftar, setDaftar] = useState<Project[]>([]);
  const [busy, setBusy] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  // Kartu induk yang sedang dibuka (mis. The Sanctuary Collection): yang
  // tampil pilihan cluster-nya.
  const [grup, setGrup] = useState<GrupProject | null>(null);

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
      })
      .catch((e) => setGalat(String(e?.message ?? e)))
      .finally(() => setBusy(false));
  }, []);

  const pilih = async (slug: string) => {
    // Project yang baru untuk Pricelist saja langsung dibawa ke Pricelist.
    const kePricelist = hanyaPricelist(slug);
    setBusy(true); setGalat(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }) });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) { setGalat(b.detail ?? `HTTP ${res.status}`); return; }
      if (kePricelist) {
        const n = new URLSearchParams(window.location.search).get("next") ?? "";
        location.href = layarBoleh(n) && n.startsWith("/") && !n.startsWith("//") ? n : "/pricelist";
      } else lanjut();
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
        <div>
          <h1>Pilih Kategori Proyek</h1>
          <p>Seluruh data yang ditampilkan mengikuti proyek yang dipilih</p>
        </div>
      </header>

      {galat && <div className="banner stop">{galat}</div>}

      {grup && (
        <div className="pilih-cluster">
          <button className="kecil" disabled={busy} onClick={() => setGrup(null)}>← Kembali ke daftar proyek</button>
          <h2>{grup.nama} — pilih cluster</h2>
        </div>
      )}

      <div className="pilihan">
        {grup ? daftar.filter((p) => grup.anggota.includes(p.slug)).map((p) => (
          /* Pilihan cluster: lambang cluster itu sendiri (namanya sudah ada di
             dalam lambang), nama PT di bawahnya seperti kartu lain. */
          <button key={p.slug} disabled={busy} className="opsi kartu-project"
                  onClick={() => void pilih(p.slug)}>
            <span className="lambang">
              <LogoProject slug={p.slug} tinggi={54} alt={p.name} gantiTeks={p.name} />
            </span>
            <span className="nama">{p.company_name}</span>
          </button>
        )) : tampilan(daftar).map((x) => "grup" in x ? (
          /* Kartu induk: diklik, pilihan cluster-nya muncul. */
          <button key={x.grup.slug} disabled={busy} className="opsi kartu-project"
                  onClick={() => setGrup(x.grup)}>
            <span className="lambang">
              <LogoProject slug={x.grup.slug} tinggi={54} alt={x.grup.nama} gantiTeks={x.grup.nama} />
            </span>
            <span className="nama">{x.company_name}</span>
          </button>
        ) : ((p: Project) => (
          /* Semua kartu sama besar, dan urutannya tetap: urutan yang tersimpan
             pada tabel projects, bukan urutan yang dipengaruhi project mana
             yang terakhir dikerjakan. Letak tiap project di layar ini tidak
             berubah dari satu kali masuk ke kali berikutnya — yang sudah hafal
             letaknya tidak perlu membaca lagi. */
          <button key={p.slug} disabled={busy} className="opsi kartu-project"
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
        ))(x))}
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
