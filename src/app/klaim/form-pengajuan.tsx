"use client";

/**
 * Pratinjau Form Pengajuan, sebagaimana ia akan dicetak.
 *
 * Satu komponen dipakai dua layar — setelah klaim diajukan, dan saat klaim lama
 * dibuka dari konsol. Dua salinan tata letak yang sama akan berbeda cepat atau
 * lambat, dan bedanya berupa dua versi dokumen yang sama-sama mengaku resmi.
 *
 * Isinya dibaca dari klaim yang tersimpan, bukan dari apa yang sempat diketik di
 * layar. Klaim yang dibuka bulan depan karenanya menampilkan angka yang sama
 * persis dengan yang disetujui, bukan angka yang dihitung ulang hari ini dengan
 * memo yang mungkin sudah berganti.
 */

import { CATATAN, DOKUMEN, JUDUL_HITUNG, KOP, type Jenis } from "./jenis";

/**
 * Rupiah seperti tertulis pada formulir aslinya: "Rp. 3.422.000.000,-".
 *
 * Titik sesudah "Rp" dan tanda "-" di ujung bukan hiasan; itu bentuk yang
 * dipakai seluruh cetakan yang beredar, dan formulir yang menulisnya berbeda
 * terbaca sebagai dokumen dari sistem lain.
 */
const rp = (n?: number | null) =>
  `Rp. ${(n ?? 0).toLocaleString("id-ID")},-`;
const tgl = (v?: string | null) => (v ? String(v).slice(0, 10) : "—");

const JENIS_NAMA: Record<string, string> = {
  closing_fee: "Closing Fee", commission: "Komisi",
  cash_reward: "Cash Reward", overriding: "Overriding",
};

export function FormPengajuan(
  { klaim, ttdPemohon }: { klaim: any; ttdPemohon?: string | null },
) {
  const jenis = klaim.claim_type as Jenis;
  const nama = JENIS_NAMA[jenis] ?? jenis;
  const u = klaim.unit ?? {};
  const m = klaim.marketing ?? {};
  const bank = klaim.bank_account ?? null;
  // Nama PT mengikuti project klaimnya, bukan tulisan tetap: beberapa project
  // berjalan di pemasangan yang sama dan tidak semuanya di bawah PT yang sama.
  const pt = klaim.project?.company_name ?? "PT. Serpong Bangun Lestari";
  const s = klaim.snapshot ?? {};
  const dokumen = DOKUMEN[jenis] ?? [];
  // Hanya berkas yang benar-benar diunggah. Baris checklist tanpa berkas juga
  // tersimpan di tabel yang sama — itu centang syarat pengajuan, bukan lampiran,
  // dan mencantumkannya di sini membuat formulir mengaku memuat sembilan
  // dokumen yang tidak ada satu pun berkasnya.
  const lampiran: any[] = (klaim.documents ?? []).filter((d: any) => d.file_name);

  // Tanda tangan yang ditempel pada kolom Pemohon.
  //
  // `ttdPemohon` adalah goresan yang baru saja dibuat di layar tanda tangan —
  // dipakai agar agent melihat tanda tangannya sudah menempel di formulir
  // sebelum mengirim, bukan setelahnya. Yang tersimpan pada klaim dipakai di
  // semua layar lain, dan itulah yang ikut tercetak.
  //
  // Yang tersimpan tidak selalu berupa data URL: goresan dari kanvas datang
  // lengkap dengan awalan `data:`, sedangkan spesimen yang dibangkitkan di
  // server hanya base64 telanjang. Keduanya disamakan di sini — kalau tidak,
  // kolom Pemohon menampilkan ikon gambar rusak untuk sebagian klaim saja.
  const sumber = ttdPemohon ?? klaim.signature_png ?? null;
  const ttd = !sumber ? null
    : sumber.startsWith("data:") ? sumber
    : `data:image/png;base64,${sumber}`;
  const ttdTgl = ttdPemohon ? null : klaim.signed_display_at;

  return (
    <div className="cetak">
      <div className="kop">
        <b>{pt.toUpperCase()}</b>
        {KOP.map((baris) => <span key={baris}>{baris}</span>)}
      </div>

      <h2 className="judul-form">FORM PENGAJUAN {nama.toUpperCase()}</h2>
      <p className="nomor-form">
        {klaim.claim_number} · status {klaim.status}
        {klaim.created_at ? ` · dibuat ${tgl(klaim.created_at)}` : ""}
      </p>

      <div className="form-blok">
        <h3>INFORMASI DATA MARKETING</h3>
        <table><tbody>
          <tr><td>Nama Marketing</td><td>{m.full_name ?? "—"}</td></tr>
          <tr><td>Status</td>
              <td>{m.marketing_type === "agent" ? "Agent"
                   : m.marketing_type === "inhouse" ? "Inhouse" : "—"}</td></tr>
          <tr><td>Nama Kantor Marketing</td>
              <td>{m.agency_name ?? pt}</td></tr>
          <tr><td>Alamat Kantor</td><td>{m.agency_address ?? "—"}</td></tr>
          <tr><td>NPWP</td><td>{m.npwp || m.agency_npwp || "—"}</td></tr>
          <tr><td>No. Telepon / HP</td><td>{m.phone || "—"}</td></tr>
          <tr><td>Email</td><td>{m.email || "—"}</td></tr>
        </tbody></table>
      </div>

      {/* Judul dan urutan barisnya berbeda antar cetakan: Komisi memakai
          "INFORMASI DATA PEMESAN" dan menaruh Tanggal Penjualan tepat di bawah
          Nama Pemesan, sedangkan Closing Fee dan Cash Reward menaruhnya di
          bawah Luas Bangunan. Nama project berdiri sebagai baris tebal tanpa
          label, sama seperti "BIO DISTRICT" pada cetakannya. */}
      <div className="form-blok">
        <h3>INFORMASI DATA PEMESAN{jenis === "commission" ? "" : "AN"}</h3>
        <table><tbody>
          <tr><td colSpan={2} className="baris-project">
              <b>{(u.project_name ?? klaim.project?.name ?? "—").toUpperCase()}</b>
          </td></tr>
          <tr><td>Nama Pemesan</td><td>{u.buyer_name ?? "—"}</td></tr>
          {jenis === "commission" && (
            <tr><td>Tanggal Penjualan</td><td>{tgl(u.contract_date)}</td></tr>
          )}
          <tr><td>Kluster</td><td>{u.cluster_code ?? "—"}</td></tr>
          <tr><td>No. Unit</td><td><b>{u.code ?? "—"}</b></td></tr>
          <tr><td>Tipe</td><td>{u.unit_type ?? "—"}</td></tr>
          <tr><td>Luas Tanah</td>
              <td>{u.land_area ? `${u.land_area} M²` : "—"}</td></tr>
          <tr><td>Luas Bangunan</td>
              <td>{u.building_area ? `${u.building_area} M²` : "—"}</td></tr>
          {jenis !== "commission" && (
            <tr><td>Tanggal Penjualan</td><td>{tgl(u.contract_date)}</td></tr>
          )}
          <tr><td>Harga Transaksi</td>
              <td>{rp(u.contract_value_incl_vat)}</td></tr>
        </tbody></table>
      </div>

      <div className="form-blok hitung">
        <h3>{JUDUL_HITUNG[jenis] ?? `PERHITUNGAN ${nama.toUpperCase()}`}</h3>
        <table><tbody>
          {jenis === "commission" && (
            <tr><td>Total Pembayaran / Persen Pembayaran</td>
                <td>{rp(klaim.total_payment)} ·{" "}
                    {(Number(klaim.payment_percent ?? 0) * 100).toFixed(2)}%</td></tr>
          )}
          <tr><td>Jumlah {nama}</td><td>{rp(klaim.gross_amount)}</td></tr>
          <tr><td>PPN</td><td>{rp(klaim.vat)}</td></tr>
          <tr><td>Potongan PPh
                  {klaim.withholding_tax_type
                    ? ` (${String(klaim.withholding_tax_type)
                        .replace(/^pph/i, "PPh ").toUpperCase()
                        .replace("PPH ", "PPh ")})`
                    : ""}</td>
              <td>− {rp(klaim.withholding_tax)}</td></tr>
          <tr className="total"><td>{nama} yang Dibayarkan</td>
              <td>{rp(klaim.net_amount)}</td></tr>
          {/* Komisi tidak punya baris Terbilang pada cetakannya; Closing Fee
              dan Cash Reward punya. */}
          {jenis !== "commission" && klaim.amount_in_words && (
            <tr><td>Terbilang</td>
                <td style={{ fontStyle: "italic" }}># {klaim.amount_in_words} #</td></tr>
          )}
        </tbody></table>

        {/* Dasar perhitungan ikut tercetak: angka tanpa rujukan memonya tidak
            dapat diperiksa ulang oleh siapa pun yang menandatanganinya. */}
        {(s.scheme_memo || s.withholding_basis) && (
          <p className="dasar">
            {s.scheme_memo && (
              <>Dasar: memo {String(s.scheme_memo)},{" "}
                {s.flat_amount
                  ? `${rp(Number(s.flat_amount))} per unit` +
                    (s.flat_amount_is_net ? " (exclude PPh — nilai bersih)" : "")
                  : `tarif ${(Number(s.percentage ?? 0) * 100).toFixed(3)}%` +
                    (s.tier_unit_count
                      ? ` (jenjang dari ${s.tier_unit_count} unit pada bulan kontrak)`
                      : "")}.{" "}
              </>
            )}
            {s.withholding_basis && <>Jenis PPh: {String(s.withholding_basis)}.</>}
          </p>
        )}
      </div>

      <div className="form-blok">
        <h3>PENJELASAN PENGAJUAN {nama.toUpperCase()}</h3>
        <p className="penjelasan">
          {klaim.notes?.trim() || <span style={{ color: "var(--mut)" }}>—</span>}
        </p>
      </div>

      {dokumen.length > 0 && (
        <div className="form-blok">
          <h3>
            SYARAT{jenis === "commission" ? "/" : " / "}DOKUMEN PENGAJUAN{" "}
            {nama.toUpperCase()}
          </h3>
          <ul className="ceklis cetak-ceklis">
            {dokumen.map((d, i) => (
              <li key={d}><span className="kotak">✓</span> {i + 1}. {d}</li>
            ))}
          </ul>
          {/* Sistem tidak menyimpan centang per dokumen; yang dapat dipastikan
              adalah pengajuan lewat konsol tidak mungkin lolos tanpa seluruhnya
              dicentang. Itu yang dinyatakan, bukan lebih. */}
          <p className="hint" style={{ textAlign: "left" }}>
            Pengajuan lewat konsol tidak dapat dikirim sebelum seluruh dokumen di
            atas dicentang pemohonnya.
          </p>
        </div>
      )}

      <div className="form-blok">
        <h3>TUJUAN TRANSFER</h3>
        {bank ? (
          <>
            {/* Komisi menamai barisnya "Nama (yang tercantum di Rekening Bank)"
                dan menaruh No. Rekening di atas BANK; Closing Fee dan Cash
                Reward sebaliknya. */}
            <table><tbody>
              <tr>
                <td>{jenis === "commission"
                      ? "Nama (yang tercantum di Rekening Bank)"
                      : "Nama Penerima"}</td>
                <td>{bank.holder_name}</td>
              </tr>
              {jenis === "commission" ? (
                <>
                  <tr><td>No. Rekening</td><td>{bank.account_number}</td></tr>
                  <tr><td>BANK</td><td>{bank.bank_name}</td></tr>
                </>
              ) : (
                <>
                  <tr><td>BANK</td><td>{bank.bank_name}</td></tr>
                  <tr><td>No. Rekening</td><td>{bank.account_number}</td></tr>
                </>
              )}
              <tr><td>Kantor Cabang</td><td>{bank.branch ?? "—"}</td></tr>
            </tbody></table>
            {/* Atas nama siapa rekeningnya menentukan PPh 21 atau PPh 23, jadi
                tetap dicetak — tetapi di luar tabel, karena cetakan aslinya
                hanya memuat empat baris di atas. */}
            <p className="dasar">
              Rekening atas nama{" "}
              {bank.holder_type === "company"
                ? "badan usaha (PT)" : "pribadi (perorangan)"}.
            </p>
          </>
        ) : (
          <p className="hint" style={{ textAlign: "left" }}>
            Belum ada rekening tujuan yang terverifikasi. Klaim belum dapat
            dibayarkan sebelum rekeningnya ditetapkan.
          </p>
        )}
      </div>

      {lampiran.length > 0 && (
        <div className="form-blok">
          <h3>LAMPIRAN</h3>
          <table><tbody>
            {lampiran.map((l) => (
              <tr key={l.id}>
                <td>{l.checklist_item}</td>
                <td>
                  {l.file_name}
                  {l.size_bytes
                    ? ` · ${Math.max(1, Math.round(l.size_bytes / 1024))} KB` : ""}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {/* Susunannya mengikuti cetakan: Pemohon berdiri sendiri di kiri,
          sedangkan Admin & Finance dan Management bernaung di bawah satu
          judul "Developer" di kanan. Empat kotak sejajar — bentuk sebelumnya —
          menyatakan keempatnya setara, padahal dua di antaranya adalah dua
          tanda tangan dari pihak developer yang sama. */}
      <div className="form-blok">
        <h3>PENGESAHAN</h3>
        <div className="sah">
          <div className="sah-kiri">
            <div className="sah-judul">Pemohon</div>
            <div className="kotak-ttd">
              {ttd && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={ttd} alt="Tanda tangan pemohon" />
              )}
            </div>
            <span>
              {m.full_name ?? ""}
              {ttd && ttdTgl ? <><br />{tgl(ttdTgl)}</> : null}
            </span>
          </div>

          <div className="sah-kanan">
            <div className="sah-judul">Developer</div>
            <div className="sah-dua">
              {["Admin & Finance", "Management"].map((r) => (
                <div key={r}>
                  <div className="kotak-ttd" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {CATATAN[jenis]?.length > 0 && (
        <div className="catatan-form">
          <b>Catatan.</b>
          <ul>
            {CATATAN[jenis].map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      <p className="hint" style={{ textAlign: "left" }}>
        Nilai pada dokumen ini diambil dari klaim yang tersimpan, bukan dihitung
        ulang saat dibuka — angkanya tetap sama sekalipun memo skema berganti.
      </p>
    </div>
  );
}
