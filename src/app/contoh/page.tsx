"use client";

/**
 * Contoh alur: pesan WhatsApp dan layar Sales/Agent, dalam satu layar.
 *
 * Dua langkah terakhir pengajuan fee berjalan di luar konsol — pada WhatsApp
 * Admin Sales dan pada ponsel Sales/Agent — sehingga tidak ada satu pun layar
 * yang memperlihatkannya. Yang belum pernah menjalankannya harus menerbitkan
 * tautan sungguhan ke nomor sungguhan hanya untuk tahu apa yang akan diterima
 * orang di seberang.
 *
 * Layar ini memperlihatkan keduanya lebih dulu: bentuk pesannya, dan empat
 * langkah yang dikerjakan Sales/Agent sesudah membukanya.
 *
 * Yang ditampilkan tanpa klaim terpilih adalah contoh — nomor dan kodenya
 * karangan, tautannya tidak mengantar ke mana-mana. Begitu satu klaim yang
 * sudah lolos verifikasi pajak dipilih dan tautannya diterbitkan, yang tampil
 * adalah pesan dan tautan yang sesungguhnya: layar ini berhenti menjadi contoh
 * dan menjadi alat kerja. Bedanya disebutkan di layar, bukan dibiarkan ditebak.
 */

import { useCallback, useEffect, useState } from "react";

import { useBahasa, useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { namaJenis } from "../klaim/jenis";

/** Nomor untuk tautan wa.me, yang hanya menerima bentuk internasional. */
function nomorWa(hp?: string | null): string {
  const bersih = String(hp ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  return bersih.startsWith("0") ? `62${bersih.slice(1)}` : bersih;
}

const CONTOH = {
  klaim: "KMS-2026-0007",
  nama: "Fransisca Yolanda",
  hp: "0812••••800",
  kode: "418302",
};

const KATA = {
  id: {
    judul: "Contoh Alur",
    pengantar: "Bentuk pesan WhatsApp yang diterima Sales/Agent, dan layar " +
               "yang ia isi setelah membukanya.",
    panelWa: "Pesan WhatsApp ke Sales/Agent",
    panelLayar: "Layar Sales/Agent",
    pilih: "Klaim yang sudah lolos verifikasi pajak",
    takAda: "contoh (belum ada klaim yang lolos verifikasi pajak)",
    terbitkan: "Terbitkan tautan",
    menerbitkan: "Menerbitkan…",
    ulang: "Terbitkan ulang",
    bukanAdmin: "Penerbitan tautan hanya oleh Admin Sales. Yang tampil di " +
                "bawah adalah contoh.",
    iniContoh: "Ini contoh. Nomor, kode, dan tautannya karangan — tidak ada " +
               "pesan yang terkirim ke siapa pun.",
    iniSungguhan: "Tautan ini sungguhan dan berlaku terbatas. Kirimkan lewat " +
                  "tombol di bawah, atau salin alamatnya.",
    kodeTerpisah: "Kode tidak ikut di dalam pesan. Siapa pun yang meneruskan " +
                  "pesan itu akan ikut membawa keduanya — kode disebutkan " +
                  "lewat panggilan atau pesan terpisah.",
    bukaWa: "Buka WhatsApp",
    salin: "Salin tautan",
    tersalin: "Tautan disalin.",
    bukaLayar: "Buka layar Sales/Agent",
    langkah: "Empat langkah yang dikerjakan Sales/Agent:",
    l1: "Memasukkan kode yang Anda sebutkan.",
    l2: "Membaca Form Pengajuan utuh — yang sama persis dengan yang dicetak.",
    l3: "Mengunggah Kwitansi dan Invoice; keduanya wajib.",
    l4: "Menandatangani pada kolom Pemohon, lalu mengirim.",
    sesudah: "Sesudah itu dokumennya tersegel: nilainya tidak dapat diubah " +
             "lagi tanpa membatalkan tanda tangannya.",
    layarContoh: "Layar itu hanya terbuka dengan tautan yang berlaku. " +
                 "Terbitkan tautan di atas untuk membukanya.",
    galat: "Tautan tidak dapat diterbitkan",
    hpKosong: "Data penerima belum mencantumkan nomor HP.",
    waKe: "WhatsApp ke",
    kodeBalon: "Kodenya: ",
  },
  en: {
    judul: "Walkthrough",
    pengantar: "The WhatsApp message the Sales/Agent receives, and the screen " +
               "they fill in after opening it.",
    panelWa: "WhatsApp message to the Sales/Agent",
    panelLayar: "The Sales/Agent screen",
    pilih: "A claim that has passed tax verification",
    takAda: "sample (no tax-verified claim yet)",
    terbitkan: "Issue the link",
    menerbitkan: "Issuing…",
    ulang: "Issue again",
    bukanAdmin: "Only the Sales Admin can issue links. What is shown below " +
                "is a sample.",
    iniContoh: "This is a sample. The number, code and link are made up — " +
               "nothing is sent to anyone.",
    iniSungguhan: "This link is real and short-lived. Send it with the button " +
                  "below, or copy the address.",
    kodeTerpisah: "The code is not part of the message. Anyone forwarding it " +
                  "would carry both — the code is given by call or in a " +
                  "separate message.",
    bukaWa: "Open WhatsApp",
    salin: "Copy the link",
    tersalin: "Link copied.",
    bukaLayar: "Open the Sales/Agent screen",
    langkah: "The four steps the Sales/Agent goes through:",
    l1: "Enter the code you gave them.",
    l2: "Read the full submission form — the very one that gets printed.",
    l3: "Upload the receipt and invoice; both are required.",
    l4: "Sign in the applicant box, then send.",
    sesudah: "After that the document is sealed: its amounts cannot change " +
             "without voiding the signature.",
    layarContoh: "That screen only opens with a valid link. Issue one above " +
                 "to open it.",
    galat: "The link could not be issued",
    hpKosong: "The recipient has no phone number on record.",
    waKe: "WhatsApp to",
    kodeBalon: "The code: ",
  },
};

export default function ContohPage() {
  const { sesi, memuat } = useSesi();
  const { bahasa } = useBahasa();
  const k = useKata(KATA);
  const [klaim, setKlaim] = useState<any[]>([]);
  const [pilih, setPilih] = useState<string>("");
  const [terbit, setTerbit] = useState<any | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const bolehTerbit = sesi?.role === "admin_sales";

  const muat = useCallback(async () => {
    try {
      const res = await fetch("/api/claims?status=tax_verified,signature_link_sent");
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => []);
      setKlaim(Array.isArray(b) ? b : []);
    } catch { /* layar ini pelengkap; galatnya tidak menutup apa pun */ }
  }, []);

  useEffect(() => { if (sesi) void muat(); }, [sesi, muat]);

  if (memuat || !sesi) return <MemeriksaSesi />;

  const dipilih = klaim.find((c) => c.id === pilih) ?? null;
  const hp = dipilih?.marketing?.phone ?? "";
  const alamat = terbit && typeof window !== "undefined"
    ? `${window.location.origin}/sign/${terbit.token}` : "";

  const terbitkan = async () => {
    if (!dipilih) return;
    setSibuk(true); setGalat(null); setKabar(null);
    try {
      const res = await fetch(`/api/claims/${dipilih.id}/signature-requests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: "{}" });
      if (res.status === 401) { location.href = "/login"; return; }
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setGalat(b.detail ?? b.title ?? `HTTP ${res.status}`);
        return;
      }
      setTerbit(b);
      await muat();
    } catch (e: any) {
      setGalat(String(e?.message ?? e));
    } finally { setSibuk(false); }
  };

  // Isi gelembung pesannya: sungguhan bila tautannya sudah terbit, contoh bila
  // belum. Bentuknya sama persis, supaya yang dilihat saat belajar adalah yang
  // akan dilihat saat bekerja.
  const nomorTampil = terbit ? terbit.masked_phone : CONTOH.hp;
  const nama = dipilih?.marketing?.full_name ?? CONTOH.nama;
  const pesan = terbit
    ? terbit.message
    : `Dokumen klaim ${CONTOH.klaim} siap ditandatangani. Buka tautan ` +
      "berikut dan masukkan kode yang kami kirim.";
  const tautanTampil = terbit ? alamat
    : `${typeof window !== "undefined" ? window.location.origin : ""}/sign/contoh`;
  const kode = terbit ? terbit.otp_demo : CONTOH.kode;

  return (
    <Kerangka sesi={sesi} judul={
      <div>
        <h1>{k.judul}</h1>
        <p>{k.pengantar}</p>
      </div>
    }>
      {galat && <div className="banner stop"><b>{k.galat}</b>{galat}</div>}
      {kabar && <div className="banner ok">{kabar}</div>}
      {!bolehTerbit && <div className="banner warn">{k.bukanAdmin}</div>}

      {bolehTerbit && (
        <div className="panel sp">
          <div className="filters">
            <div style={{ flex: "1 1 340px" }}>
              <div className="lbl">{k.pilih}</div>
              <select value={pilih}
                      onChange={(e) => { setPilih(e.target.value); setTerbit(null); }}>
                <option value="">— {k.takAda} —</option>
                {klaim.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.claim_number} — {namaJenis(c.claim_type, bahasa)} —{" "}
                    {c.marketing?.full_name ?? "—"}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ alignSelf: "flex-end" }}>
              <button className="pri" disabled={!dipilih || sibuk || !hp}
                      onClick={() => void terbitkan()}>
                {sibuk ? k.menerbitkan : terbit ? k.ulang : k.terbitkan}
              </button>
            </div>
          </div>
          {dipilih && !hp && (
            <p className="hint" style={{ textAlign: "left" }}>{k.hpKosong}</p>
          )}
        </div>
      )}

      <div className="dua-kolom">
        <div className="panel">
          <h2>{k.panelWa}</h2>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {terbit ? k.iniSungguhan : k.iniContoh}
          </p>

          {/* Tiruan tampilan WhatsApp. Bukan tangkapan layar: isinya berubah
              mengikuti klaim yang dipilih, dan tangkapan layar akan terus
              memperlihatkan pesan lama setelah kalimatnya diubah. */}
          <div className="wa-bingkai">
            <div className="wa-kepala">
              <span className="wa-avatar">{nama.slice(0, 1).toUpperCase()}</span>
              <span>
                <b>{nama}</b>
                <span className="wa-nomor">{k.waKe} {nomorTampil}</span>
              </span>
            </div>
            <div className="wa-isi">
              <div className="wa-balon">
                {pesan}
                <a className="wa-tautan" href={terbit ? alamat : undefined}
                   target="_blank" rel="noreferrer">{tautanTampil}</a>
                <span className="wa-jam">09:41 ✓✓</span>
              </div>
              <div className="wa-balon">
                {k.kodeBalon}<b>{kode}</b>
                <span className="wa-jam">09:41 ✓✓</span>
              </div>
            </div>
          </div>

          <p className="hint" style={{ textAlign: "left" }}>{k.kodeTerpisah}</p>

          {terbit && (
            <div className="row" style={{ marginBottom: 0 }}>
              <a className="tombol-klaim kecil"
                 href={`https://wa.me/${nomorWa(hp)}?text=${encodeURIComponent(
                   `${terbit.message}\n${alamat}`)}`}
                 target="_blank" rel="noreferrer">{k.bukaWa}</a>
              <button onClick={() => {
                navigator.clipboard?.writeText(alamat);
                setKabar(k.tersalin);
              }}>{k.salin}</button>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>{k.panelLayar}</h2>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.langkah}
          </p>
          <ol className="langkah-agent">
            <li>{k.l1}</li>
            <li>{k.l2}</li>
            <li>{k.l3}</li>
            <li>{k.l4}</li>
          </ol>
          <p className="hint" style={{ textAlign: "left" }}>{k.sesudah}</p>

          {terbit ? (
            <div className="row" style={{ marginBottom: 0 }}>
              <a className="tombol-klaim kecil" href={alamat}
                 target="_blank" rel="noreferrer">{k.bukaLayar}</a>
            </div>
          ) : (
            <p className="hint" style={{ textAlign: "left" }}>{k.layarContoh}</p>
          )}
        </div>
      </div>
    </Kerangka>
  );
}
