"use client";

/**
 * Pilihan bahasa, satu untuk seluruh aplikasi.
 *
 * Sebelumnya hanya halaman masuk yang dua bahasa, dan pilihannya disimpan di
 * dalam halaman itu sendiri. Begitu layar konsol ikut diterjemahkan, pilihan
 * yang tinggal di satu halaman tidak cukup: yang disetel sebelum masuk harus
 * tetap berlaku sesudahnya.
 *
 * Bukan pustaka i18n. Yang dibutuhkan aplikasi ini adalah dua bahasa tetap,
 * tanpa bentuk jamak yang rumit, tanpa pemuatan kamus per rute, dan tanpa
 * penerjemahan di sisi server — seluruh layarnya sudah "use client" karena
 * identitasnya dibaca dari cookie sesi lewat /api/auth/me. Memasang kerangka
 * yang menjawab semua itu berarti menanggung bebannya tanpa memakai satu pun
 * bagian yang membuatnya sepadan.
 */

import { createContext, useContext, useEffect, useState } from "react";

export type Bahasa = "id" | "en";

/** Di mana pilihannya disimpan, supaya kuncinya tidak diketik dua kali. */
const KUNCI = "chl.bahasa";

const Konteks = createContext<{
  bahasa: Bahasa;
  gantiBahasa: (b: Bahasa) => void;
}>({ bahasa: "id", gantiBahasa: () => {} });

export function PenyediaBahasa({ children }: { children: React.ReactNode }) {
  // Bawaannya Indonesia, dan pilihan tersimpan dibaca setelah komponen
  // terpasang — bukan saat render pertama. Membaca localStorage saat render
  // membuat keluaran server dan klien berbeda, dan React membuang seluruh
  // pohonnya begitu keduanya tidak cocok.
  const [bahasa, setBahasa] = useState<Bahasa>("id");

  // Dibungkus try/catch: di jendela penyamaran, atau saat penyimpanan situs
  // diblokir, membaca localStorage melempar — dan halaman yang gagal tampil
  // karena pilihan bahasa adalah harga yang jauh lebih mahal daripada
  // manfaatnya.
  useEffect(() => {
    try {
      const t = localStorage.getItem(KUNCI);
      if (t === "id" || t === "en") setBahasa(t);
    } catch { /* pakai bawaannya */ }
  }, []);

  // Atribut lang ikut berganti. Pembaca layar memilih pelafalan dari sana, dan
  // halaman berbahasa Inggris yang mengaku berbahasa Indonesia dibacakan
  // dengan pelafalan yang salah dari awal sampai akhir.
  useEffect(() => { document.documentElement.lang = bahasa; }, [bahasa]);

  const gantiBahasa = (b: Bahasa) => {
    setBahasa(b);
    try { localStorage.setItem(KUNCI, b); } catch { /* tidak apa-apa */ }
  };

  return (
    <Konteks.Provider value={{ bahasa, gantiBahasa }}>
      {children}
    </Konteks.Provider>
  );
}

export const useBahasa = () => useContext(Konteks);

/**
 * Kata-kata halaman ini dalam bahasa yang sedang dipakai.
 *
 * Kamusnya diletakkan di berkas layarnya masing-masing, bukan dikumpulkan
 * jadi satu berkas raksasa: kata yang hanya dipakai satu layar lebih mudah
 * dijaga tetap benar bila ia duduk di sebelah layar yang memakainya.
 */
export function useKata<T>(kamus: { id: T; en: T }): T {
  return kamus[useBahasa().bahasa];
}

/** Nama bahasanya, untuk label yang dibaca pembaca layar. */
const LABEL: Record<Bahasa, string> = { id: "Pilih bahasa", en: "Choose language" };

/**
 * Tombol ID/EN. Bentuknya satu kotak berisi dua tombol, bukan dua tombol
 * terpisah: yang dipilih adalah salah satu dari dua, dan bentuk yang menyatu
 * itulah yang menyatakannya tanpa perlu tulisan tambahan.
 */
export function TombolBahasa({ className = "" }: { className?: string }) {
  const { bahasa, gantiBahasa } = useBahasa();
  return (
    <div className={`pilih-bahasa ${className}`.trim()} role="group"
         aria-label={LABEL[bahasa]}>
      {(["id", "en"] as const).map((b) => (
        <button key={b} type="button" onClick={() => gantiBahasa(b)}
                className={bahasa === b ? "aktif" : ""}
                aria-pressed={bahasa === b}>
          {b.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
