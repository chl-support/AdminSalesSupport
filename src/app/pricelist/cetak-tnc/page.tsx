"use client";

/**
 * Cetak Terms & Conditions (Term of Payment) pada kertas A4, seperti lembar
 * T&C berkas PL Excel: logo project, judul, tanggal, cara bayar dua kolom,
 * CATATAN, dan rekening pembayaran.
 *
 * Isinya dikirim halaman Pricelist lewat localStorage tepat sebelum tab ini
 * dibuka, sehingga isian yang belum disimpan pun ikut tercetak. Orientasi,
 * ukuran huruf, dan jumlah kolom dapat diatur supaya muat satu halaman.
 *
 * Cara bayar, catatan, dan rekening yang tidak dicentang di "Pilih isi yang
 * dicetak" hanya disembunyikan dari cetakan — isian Pricelist tidak berubah.
 * Pilihan itu diingat peramban per project untuk cetakan berikutnya.
 *
 * Lampiran gambar T&C (sama untuk semua project) dapat menyambung di bawah
 * rekening (satu halaman bila muat; ukurannya ikut ukuran huruf, sehingga
 * "Muatkan 1 halaman" ikut mengecilkannya) atau dicetak di halaman
 * terpisah — dipilih dengan tombol "Lampiran".
 */

import { useEffect, useRef, useState } from "react";

import type { Tnc } from "@/lib/susun-pricelist";
import { TeksBergaya, tanpaGaya } from "../gaya-teks";

const KUNCI_CETAK_TNC = "cetak-tnc";

type Isi = { tnc: Tnc; tanggal: string; slug: string | null };

/** Kunci tiap butir supaya pilihan tetap cocok walau urutannya bergeser. */
type Sembunyi = { caraBayar: string[]; catatan: string[]; rekening: string[]; gambar: string[] };
const KOSONG: Sembunyi = { caraBayar: [], catatan: [], rekening: [], gambar: [] };
const kunciCatatan = (c: string) => c.slice(0, 80);
const kunciRek = (r: Tnc["rekening"][number]) => `${r.bank}|${r.noRek}`;

/** Tinggi isi halaman A4 dalam px CSS (96 dpi) dikurangi margin 10 mm. */
const TINGGI = { lanskap: (210 - 20) * 96 / 25.4, potret: (297 - 20) * 96 / 25.4 };
const LEBAR = { lanskap: (297 - 20) * 96 / 25.4, potret: (210 - 20) * 96 / 25.4 };

export default function CetakTnc() {
  const [isi, setIsi] = useState<Isi | null>(null);
  const [arah, setArah] = useState<"lanskap" | "potret">("lanskap");
  const [huruf, setHuruf] = useState(8);
  const [muatkan, setMuatkan] = useState(false);
  const [kolom, setKolom] = useState(2);
  const [lebih, setLebih] = useState(false);
  const [sembunyi, setSembunyi] = useState<Sembunyi>(KOSONG);
  const lembar = useRef<HTMLDivElement>(null);
  const [lampiran, setLampiran] = useState<{ id: string; nama: string }[]>([]);
  /** Dinaikkan tiap gambar lampiran selesai dimuat, supaya tinggi lembar diukur ulang. */
  const [muat, setMuat] = useState(0);
  /** Lampiran di halaman terpisah (true) atau menyambung di bawah T&C. */
  const [pisah, setPisah] = useState(false);
  useEffect(() => {
    fetch("/api/pricelist/tnc-lampiran").then((r) => r.ok ? r.json() : null)
      .then((b) => setLampiran(b?.lampiran ?? [])).catch(() => {});
  }, []);
  const kunciPilihan = `${KUNCI_CETAK_TNC}-pilihan-${isi?.slug ?? "-"}`;

  useEffect(() => {
    try {
      const s = localStorage.getItem(KUNCI_CETAK_TNC);
      if (!s) return;
      const v: Isi = JSON.parse(s);
      setIsi(v);
      const p = localStorage.getItem(`${KUNCI_CETAK_TNC}-pilihan-${v.slug ?? "-"}`);
      if (p) setSembunyi({ ...KOSONG, ...JSON.parse(p) });
    } catch { /* tidak ada isi */ }
  }, []);

  const ganti = (jenis: keyof Sembunyi, kunci: string, tampil: boolean) => {
    setSembunyi((s) => {
      const n = { ...s, [jenis]: tampil ? s[jenis].filter((k) => k !== kunci) : [...s[jenis], kunci] };
      try { localStorage.setItem(kunciPilihan, JSON.stringify(n)); } catch { /* abaikan */ }
      return n;
    });
  };
  const semua = (tampil: boolean) => {
    const n = tampil || !isi ? KOSONG : {
      caraBayar: isi.tnc.caraBayar.map((c) => c.judul),
      catatan: isi.tnc.catatan.map(kunciCatatan),
      rekening: isi.tnc.rekening.map(kunciRek),
      gambar: lampiran.map((g) => g.id),
    };
    setSembunyi(n);
    try { localStorage.setItem(kunciPilihan, JSON.stringify(n)); } catch { /* abaikan */ }
  };

  // Tandai bila isinya lebih panjang dari satu halaman A4. Saat "Muatkan 1
  // halaman" diminta, huruf dikecilkan setengah poin demi setengah poin
  // sampai muat (paling kecil 6 pt).
  useEffect(() => {
    const el = lembar.current;
    if (!el) return;
    const lewat = el.scrollHeight > TINGGI[arah] + 1;
    setLebih(lewat);
    if (muatkan) {
      if (lewat && huruf > 6) setHuruf((h) => +(h - 0.5).toFixed(1));
      else setMuatkan(false);
    }
  }, [isi, arah, huruf, kolom, muatkan, sembunyi, lampiran, muat, pisah]);

  if (!isi) {
    return (
      <main className="cetak-tnc-kosong">
        <p>Tidak ada isi untuk dicetak. Buka halaman Pricelist → langkah 5. Terms &amp; Conditions,
          lalu klik <b>Cetak A4</b>.</p>
      </main>
    );
  }

  const { tnc: semuaTnc, tanggal, slug } = isi;
  // Yang dicetak: butir yang tidak disembunyikan. Nomornya diurutkan ulang.
  const tnc: Tnc = {
    ...semuaTnc,
    caraBayar: semuaTnc.caraBayar.filter((c) => !sembunyi.caraBayar.includes(c.judul)),
    catatan: semuaTnc.catatan.filter((c) => !sembunyi.catatan.includes(kunciCatatan(c))),
    rekening: semuaTnc.rekening.filter((r) => !sembunyi.rekening.includes(kunciRek(r))),
  };
  const gambar = lampiran.filter((g) => !sembunyi.gambar.includes(g.id));
  const jumlahSembunyi = semuaTnc.caraBayar.length - tnc.caraBayar.length
    + semuaTnc.catatan.length - tnc.catatan.length + semuaTnc.rekening.length - tnc.rekening.length
    + lampiran.length - gambar.length;
  const perKolom = Math.max(1, Math.ceil(tnc.caraBayar.length / kolom));
  const kelompok = Array.from({ length: kolom }, (_, k) =>
    tnc.caraBayar.map((c, i) => ({ c, i })).slice(k * perKolom, (k + 1) * perKolom));

  return (
    <>
      <style>{`
        @page { size: A4 ${arah === "lanskap" ? "landscape" : "portrait"}; margin: 10mm; }
        @media print {
          body { background: #fff !important; }
          .cetak-alat { display: none !important; }
          .cetak-kertas { box-shadow: none !important; margin: 0 !important; padding: 0 !important;
                          width: auto !important; min-height: 0 !important; }
          .cetak-latar { background: none !important; padding: 0 !important; }
        }
      `}</style>

      <div className="cetak-alat">
        <b>Cetak Terms &amp; Conditions (A4)</b>
        <label>Orientasi
          <select value={arah} onChange={(e) => setArah(e.target.value as typeof arah)}>
            <option value="lanskap">Lanskap (mendatar)</option>
            <option value="potret">Potret (tegak)</option>
          </select>
        </label>
        <label>Kolom cara bayar
          <select value={kolom} onChange={(e) => setKolom(Number(e.target.value))}>
            <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
          </select>
        </label>
        <span className="cetak-huruf">Ukuran huruf
          <button onClick={() => setHuruf((h) => Math.max(6, +(h - 0.5).toFixed(1)))} aria-label="Perkecil huruf">A−</button>
          <b>{huruf.toLocaleString("id-ID")} pt</b>
          <button onClick={() => setHuruf((h) => Math.min(14, +(h + 0.5).toFixed(1)))} aria-label="Perbesar huruf">A+</button>
        </span>
        <span className={`pill ${lebih ? "warn" : "ok"}`}>
          {lebih ? "Lebih dari 1 halaman" : "Muat 1 halaman A4"}</span>
        {lebih && <button onClick={() => setMuatkan(true)}>Muatkan 1 halaman</button>}
        {lampiran.length > 0 && (
          <span className="cetak-huruf">Lampiran
            <button className={!pisah ? "pri" : undefined} onClick={() => setPisah(false)}
                    title="Gambar lampiran menyambung di bawah T&C; naik ke halaman yang sama bila muat">
              1 halaman</button>
            <button className={pisah ? "pri" : undefined} onClick={() => setPisah(true)}
                    title="Gambar lampiran dicetak di halaman tersendiri">Dipisah</button>
          </span>
        )}
        <details className="cetak-pilih">
          <summary>Pilih isi yang dicetak{jumlahSembunyi ? ` (${jumlahSembunyi} disembunyikan)` : ""}</summary>
          <div className="cetak-pilih-isi">
            <p className="hint">Yang tidak dicentang hanya disembunyikan dari cetakan; isi Pricelist
              tidak berubah.</p>
            <div className="row" style={{ margin: "0 0 6px" }}>
              <button className="kecil" onClick={() => semua(true)}>Centang semua</button>
              <button className="kecil" onClick={() => semua(false)}>Kosongkan semua</button>
            </div>
            <b>Cara bayar</b>
            {semuaTnc.caraBayar.map((c, i) => (
              <label key={`c${i}`}><input type="checkbox" checked={!sembunyi.caraBayar.includes(c.judul)}
                onChange={(e) => ganti("caraBayar", c.judul, e.target.checked)} /> {tanpaGaya(c.judul) || `(cara bayar ${i + 1})`}</label>
            ))}
            {semuaTnc.catatan.length > 0 && <b>Catatan</b>}
            {semuaTnc.catatan.map((c, i) => (
              <label key={`n${i}`}><input type="checkbox" checked={!sembunyi.catatan.includes(kunciCatatan(c))}
                onChange={(e) => ganti("catatan", kunciCatatan(c), e.target.checked)} />
                {" "}{i + 1}. {tanpaGaya(c.split("\n")[0]).slice(0, 70)}{c.length > 70 ? "…" : ""}</label>
            ))}
            {semuaTnc.rekening.length > 0 && <b>Rekening</b>}
            {semuaTnc.rekening.map((r, i) => (
              <label key={`r${i}`}><input type="checkbox" checked={!sembunyi.rekening.includes(kunciRek(r))}
                onChange={(e) => ganti("rekening", kunciRek(r), e.target.checked)} /> {r.bank} {r.noRek}</label>
            ))}
            {lampiran.length > 0 && <b>Lampiran gambar</b>}
            {lampiran.map((g, i) => (
              <label key={`g${g.id}`}><input type="checkbox" checked={!sembunyi.gambar.includes(g.id)}
                onChange={(e) => ganti("gambar", g.id, e.target.checked)} /> {i + 1}. {g.nama}</label>
            ))}
          </div>
        </details>
        <button className="pri" onClick={() => print()}>Cetak / Simpan PDF</button>
        <button onClick={() => close()}>Tutup</button>
        <span className="hint">Di dialog cetak pilih kertas <b>A4</b>; untuk PDF pilih
          “Simpan sebagai PDF”.</span>
      </div>

      <div className="cetak-latar">
        <div className="cetak-kertas" style={{ width: LEBAR[arah] + 2 * 38, minHeight: TINGGI[arah] + 2 * 38 }}>
          <div ref={lembar} className="tnc-lembar" style={{ fontSize: `${huruf}pt` }}>
            <header>
              {slug ? <img src={`/project/${slug}.png`} alt="" className="tnc-logo" /> : <span />}
              <h1><TeksBergaya teks={tnc.judul || "TERM OF PAYMENT"} /></h1>
              <span />
            </header>
            {tanggal && <div className="tnc-tanggal"><TeksBergaya teks={tanggal} /></div>}

            <div className="tnc-kolom" style={{ gridTemplateColumns: `repeat(${kolom}, 1fr)` }}>
              {kelompok.map((kel, k) => (
                <div key={k}>
                  {kel.map(({ c, i }) => (
                    <section key={i} className="tnc-cb">
                      <h2><span>{i + 1}.</span><TeksBergaya teks={c.judul} /></h2>
                      <table><tbody>
                        {c.baris.map((b, j) => (
                          <tr key={j}>
                            <td className="h">{String.fromCharCode(97 + j)}.</td>
                            <td className="l"><TeksBergaya teks={b.label} /></td>
                            <td className="v">{b.nilai ? <>: <TeksBergaya teks={b.nilai} /></> : ""}</td>
                            <td className="w"><TeksBergaya teks={b.waktu} /></td>
                          </tr>
                        ))}
                      </tbody></table>
                      {c.catatan && <p className="tnc-cb-catatan"><TeksBergaya teks={c.catatan} /></p>}
                    </section>
                  ))}
                </div>
              ))}
            </div>

            {tnc.catatan.length > 0 && (
              <section className="tnc-catatan-cetak">
                <h3>CATATAN</h3>
                <ol>
                  {tnc.catatan.map((c, i) => {
                    const [pertama, ...lanjut] = c.split("\n");
                    return (
                      <li key={i}>
                        {lanjut.length ? <b><TeksBergaya teks={pertama} /></b> : <TeksBergaya teks={pertama} />}
                        {lanjut.map((l, j) => (
                          <div key={j} className={l.trim().startsWith("-") ? "sub" : undefined}><TeksBergaya teks={l} /></div>
                        ))}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {tnc.rekening.length > 0 && (
              <section className="tnc-rek">
                <p><TeksBergaya teks={tnc.pengantarRekening} /></p>
                {tnc.rekening.map((r, i) => (
                  <table key={i}><tbody>
                    <tr><td className="n">{i + 1})</td><td className="l">Bank</td><td>: {r.bank}</td></tr>
                    <tr><td /><td className="l">No. Rekening</td><td>: {r.noRek}</td></tr>
                    <tr><td /><td className="l">Cabang</td><td>: {r.cabang}</td></tr>
                  </tbody></table>
                ))}
              </section>
            )}

            {/* Lampiran gambar menyambung di bawah rekening. */}
            {gambar.length > 0 && !pisah && (
              <section className="tnc-lampiran">
                {gambar.map((g) => (
                  <img key={g.id} src={`/api/pricelist/tnc-lampiran/${g.id}`} alt={g.nama}
                       onLoad={() => setMuat((n) => n + 1)} />
                ))}
              </section>
            )}
          </div>
        </div>
        {/* Lampiran gambar di halaman terpisah. */}
        {gambar.length > 0 && pisah && (
          <div className="cetak-kertas tnc-lampiran-kertas"
               style={{ width: LEBAR[arah] + 2 * 38, minHeight: TINGGI[arah] + 2 * 38 }}>
            {gambar.map((g) => (
              <img key={g.id} src={`/api/pricelist/tnc-lampiran/${g.id}`} alt={g.nama}
                   style={{ maxHeight: TINGGI[arah] }} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
