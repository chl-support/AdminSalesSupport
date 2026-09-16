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

import { DOKUMEN, JUDUL_HITUNG, LABEL_PERAN, type Jenis } from "./jenis";

const rp = (n?: number | null) => `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
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
        <b>PT. SERPONG BANGUN LESTARI</b>
        <span>Jl. BSD Raya Utama Ruko Mendrisio III Blok B No. 27–29</span>
        <span>Paramount Gading Serpong, Tangerang Banten 15312</span>
        <span>Telp. +62 21 2222 0080 · Fax. +62 21 2222 0081</span>
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
              <td>{m.agency_name ?? "PT. Serpong Bangun Lestari"}</td></tr>
          <tr><td>Alamat Kantor</td><td>{m.agency_address ?? "—"}</td></tr>
          <tr><td>NPWP</td><td>{m.npwp || m.agency_npwp || "—"}</td></tr>
          <tr><td>No. Telepon / HP</td><td>{m.phone || "—"}</td></tr>
          <tr><td>Email</td><td>{m.email || "—"}</td></tr>
          <tr><td>Diterima dalam peran</td>
              <td>{LABEL_PERAN[klaim.recipient_role] ?? klaim.recipient_role}</td></tr>
        </tbody></table>
      </div>

      <div className="form-blok">
        <h3>INFORMASI DATA PEMESANAN</h3>
        <table><tbody>
          <tr><td>Project</td><td>{u.project_name ?? "—"}</td></tr>
          <tr><td>Nama Pemesan</td><td>{u.buyer_name ?? "—"}</td></tr>
          <tr><td>Kluster</td><td>{u.cluster_code ?? "—"}</td></tr>
          <tr><td>No. Unit</td><td><b>{u.code ?? "—"}</b></td></tr>
          <tr><td>Tipe</td><td>{u.unit_type ?? "—"}</td></tr>
          <tr><td>Luas Tanah</td>
              <td>{u.land_area ? `${u.land_area} m²` : "—"}</td></tr>
          <tr><td>Luas Bangunan</td>
              <td>{u.building_area ? `${u.building_area} m²` : "—"}</td></tr>
          <tr><td>No. Kontrak</td><td>{u.contract_number ?? "—"}</td></tr>
          <tr><td>Tanggal Penjualan</td><td>{tgl(u.contract_date)}</td></tr>
          <tr><td>Skema Cara Bayar</td><td>{u.payment_scheme ?? "—"}</td></tr>
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
          {klaim.amount_in_words && (
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
          <h3>SYARAT / DOKUMEN PENGAJUAN {nama.toUpperCase()}</h3>
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
          <table><tbody>
            <tr><td>Nama Penerima</td><td>{bank.holder_name}</td></tr>
            <tr><td>BANK</td><td>{bank.bank_name}</td></tr>
            <tr><td>No. Rekening</td><td>{bank.account_number}</td></tr>
            <tr><td>Kantor Cabang</td><td>{bank.branch ?? "—"}</td></tr>
            <tr><td>Atas nama</td>
                <td>{bank.holder_type === "company"
                      ? "Badan Usaha (PT)"
                      : "Pribadi (Perorangan)"}</td></tr>
          </tbody></table>
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

      <div className="form-blok">
        <h3>PENGESAHAN</h3>
        <div className="ttd">
          {["Pemohon", "Admin & Finance", "Developer", "Management"].map((r) => (
            <div key={r}>
              {/* Tanda tangan agent menempel pada kolom Pemohon, bukan berdiri
                  sebagai lampiran terpisah: yang disahkan adalah formulir ini,
                  dan tanda tangan yang terpisah dari formulirnya tidak
                  menyatakan persetujuan atas angka mana pun. */}
              <div className="kotak-ttd">
                {r === "Pemohon" && ttd && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={ttd} alt="Tanda tangan pemohon" />
                )}
              </div>
              <span>
                {r}
                {r === "Pemohon" && ttd && (
                  <>
                    <br />
                    {m.full_name ?? ""}
                    {ttdTgl ? ` · ${tgl(ttdTgl)}` : ""}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="hint" style={{ textAlign: "left" }}>
        Nilai pada dokumen ini diambil dari klaim yang tersimpan, bukan dihitung
        ulang saat dibuka — angkanya tetap sama sekalipun memo skema berganti.
      </p>
    </div>
  );
}
