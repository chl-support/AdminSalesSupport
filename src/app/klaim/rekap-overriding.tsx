"use client";

/**
 * "Detail Perhitungan Overiding" — dokumen Overriding sebagaimana dipakai
 * kantor.
 *
 * Bukan lembar per unit seperti Closing Fee dan Cash Reward. Overriding
 * dihitung per periode untuk satu Sales Manager, dan satu dokumen memuat
 * seluruh unitnya: yang sedang diajukan (dipilah per bulan kontrak), yang
 * sudah dibayar, yang tidak dibayarkan, dan yang batal — masing-masing dengan
 * baris TOTAL-nya sendiri.
 *
 * Yang menandatangani pun berbeda: tidak ada kolom Pemohon di sini. Yang ada
 * Dibuat Oleh, Diperiksa Oleh, dan tiga Disetujui Oleh, persis seperti pada
 * berkas acuannya.
 *
 * Tabelnya lebar — tiga puluh kolom lebih — jadi lembarnya melintang. Itu
 * memang bentuk aslinya; memaksanya tegak berarti mengecilkan hurufnya sampai
 * angka rupiah tidak lagi terbaca.
 */

import type { Rekap } from "@/lib/overriding";

const rp = (n?: number | null) => (n ?? 0).toLocaleString("id-ID");

/** Angka luas dan persen: kosong ditulis sebagai garis, bukan nol. */
const atau = (v: any) => (v === null || v === undefined || v === "" ? "—" : v);

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli",
               "Agustus", "September", "Oktober", "November", "Desember"];

const tgl = (v?: string | null) => {
  if (!v) return "—";
  const [th, bl, hr] = String(v).slice(0, 10).split("-").map(Number);
  if (!th || !bl || !hr) return String(v).slice(0, 10);
  return `${hr} ${BULAN[bl - 1] ?? bl} ${th}`;
};

/** Persen dari pecahan desimal: "0.002" menjadi "0,20%". */
const persen = (v?: string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 4 })}%`;
};

/**
 * Kolomnya, berikut judul bertingkat sebagaimana pada acuannya.
 *
 * `lebar` adalah bobot, bukan persen: jumlahnya dinormalkan di bawah menjadi
 * colgroup. Tiga puluh satu kolom pada satu lembar melintang tidak muat bila
 * lebarnya dibiarkan ditentukan isinya — yang terjadi bukan mengecil,
 * melainkan kolom paling kanan terdorong keluar halaman dan hilang dari
 * cetakan tanpa jejak apa pun di layar.
 */
const KOLOM: { atas: string; bawah?: string; kelas?: string; lebar: number }[] = [
  { atas: "No.", lebar: 2, kelas: "angka" },
  { atas: "Sales Group", lebar: 4.8 },
  { atas: "No. Kontrak", lebar: 5 },
  { atas: "Tgl. Kontrak", lebar: 4.5 },
  { atas: "Unit", lebar: 4 },
  { atas: "Nama Konsumen", lebar: 4.4 },
  { atas: "Marketing", lebar: 5.2 },
  { atas: "Kategori Marketing", lebar: 4.2 },
  { atas: "Luas", bawah: "Tanah", kelas: "angka", lebar: 2.5 },
  { atas: "Luas", bawah: "Bangunan", kelas: "angka", lebar: 2.8 },
  { atas: "Skema Cara Bayar", lebar: 4 },
  { atas: "Status", bawah: "Unit", lebar: 3 },
  { atas: "Status", bawah: "Tgl. Batal", lebar: 4 },
  { atas: "Type", lebar: 2.6 },
  { atas: "Arah Hadap", lebar: 2.8 },
  { atas: "Nilai Kontrak", bawah: "(Include PPN)", kelas: "angka", lebar: 5.8 },
  { atas: "Nilai Kontrak", bawah: "(Exclude PPN)", kelas: "angka", lebar: 5.8 },
  { atas: "DPP Nilai Lain", kelas: "angka", lebar: 5.8 },
  { atas: "Penerimaan", bawah: "Rp.", kelas: "angka", lebar: 5.6 },
  { atas: "Penerimaan", bawah: "%", kelas: "angka", lebar: 3.6 },
  { atas: "Total % Overiding", kelas: "angka", lebar: 4 },
  { atas: "Sign PPJB", lebar: 3 },
  { atas: "Skema Overiding", bawah: "Reguler / Progresif", lebar: 3.4 },
  { atas: "Skema Overiding", bawah: "%", kelas: "angka", lebar: 2.6 },
  { atas: "Skema Overiding", bawah: "Amount Unit (Rp.)", kelas: "angka", lebar: 4.2 },
  { atas: "Skema Overiding", bawah: "DPP Nilai Lain", kelas: "angka", lebar: 4.2 },
  { atas: "Skema Overiding", bawah: "PPN", kelas: "angka", lebar: 3.4 },
  { atas: "Skema Overiding", bawah: "PPh 23", kelas: "angka", lebar: 3.4 },
  { atas: "Skema Overiding", bawah: "Net", kelas: "angka", lebar: 4.2 },
  { atas: "Skema Overiding", bawah: "Tanggal Transfer OR", lebar: 4 },
  { atas: "Selisih Overiding", bawah: "Amount Unit (Rp.)", kelas: "angka", lebar: 4.2 },
  { atas: "Selisih Overiding", bawah: "PPh 21", kelas: "angka", lebar: 3.4 },
  { atas: "Selisih Overiding", bawah: "Net", kelas: "angka", lebar: 4.2 },
  { atas: "Selisih Overiding", bawah: "%", kelas: "angka", lebar: 2.8 },
  { atas: "Keterangan", lebar: 4 },
];

const TOTAL_LEBAR = KOLOM.reduce((t, k) => t + k.lebar, 0);

/**
 * Kolom yang berjudul sama dan berdampingan, dikumpulkan menjadi satu kepala.
 *
 * Yang berjudul tunggal — tanpa judul bawah — membentang dua baris, sebab
 * tidak ada apa pun yang berdiri di bawahnya. Yang punya judul bawah tidak
 * pernah membentang: barisnya yang kedua ditempati judul bawahnya, dan
 * membentangkannya akan menggeser seluruh kolom sesudahnya satu langkah.
 */
const KUMPULAN = KOLOM.reduce<
  { atas: string; kelas?: string; jumlah: number; bertingkat: boolean }[]
>((kump, k) => {
  const akhir = kump[kump.length - 1];
  if (k.bawah && akhir?.bertingkat && akhir.atas === k.atas) {
    akhir.jumlah++;
    return kump;
  }
  kump.push({ atas: k.atas, kelas: k.bawah ? undefined : k.kelas,
              jumlah: 1, bertingkat: Boolean(k.bawah) });
  return kump;
}, []);

export function RekapOverriding({ rekap }: { rekap: Rekap }) {
  const sm = rekap.sales_manager;
  return (
    <div className="cetak rekap-or">
      <div className="kop">
        <h1>{rekap.project?.company_name ?? rekap.project?.name ?? "—"}</h1>
      </div>

      <h2 className="judul-rekap">
        Detail Perhitungan Overiding ({rekap.nomor})
      </h2>
      <div className="kepala-rekap">
        <div>Cluster {atau(rekap.cluster)}</div>
        <div>
          Periode Penjualan : {tgl(rekap.periode_awal)} s.d{" "}
          {tgl(rekap.periode_akhir)}
        </div>
        <div>Cut Off data as of {tgl(rekap.cut_off)}</div>
      </div>

      {/* Sales Manager-nya disebut sekali, di atas tabelnya — dokumen ini
          memang dokumen satu orang, dan mengulangnya pada tiap baris hanya
          memakan kolom yang sudah sempit. */}
      <div className="sm-rekap">
        <span>Sales Manager</span>
        <b>{atau(sm?.full_name)}</b>
        {sm?.marketing_type && (
          <span className="jenis">
            {sm.marketing_type === "agent" ? "Agent" : "Inhouse"}
          </span>
        )}
      </div>

      <div className="tscroll">
        <table className="tabel-rekap">
          <colgroup>
            {KOLOM.map((k, i) => (
              <col key={i}
                   style={{ width: `${(k.lebar / TOTAL_LEBAR * 100).toFixed(3)}%` }} />
            ))}
          </colgroup>
          {/* Judul bertingkat: yang berjudul sama dan berdampingan digabung
              menjadi satu kepala yang membentang di atasnya — "Skema
              Overiding" ditulis sekali untuk delapan kolomnya, bukan delapan
              kali pada kolom selebar dua kata. */}
          <thead>
            <tr>
              {KUMPULAN.map((g, i) => (
                <th key={i} className={g.kelas}
                    colSpan={g.jumlah > 1 ? g.jumlah : undefined}
                    rowSpan={g.bertingkat ? undefined : 2}>
                  {g.atas}
                </th>
              ))}
            </tr>
            <tr>
              {KOLOM.filter((k) => k.bawah).map((k, i) => (
                <th key={i} className={k.kelas}>
                  <span className="sub">{k.bawah}</span>
                </th>
              ))}
            </tr>
          </thead>

          {rekap.bagian.map((b) => (
            <tbody key={b.judul}>
              <tr className="judul-bagian">
                <td colSpan={KOLOM.length}>{b.judul}</td>
              </tr>
              {b.baris.map((r) => (
                <tr key={`${b.judul}:${r.unit}:${r.no}`}>
                  <td className="angka">{r.no}</td>
                  <td>{atau(r.sales_group)}</td>
                  <td>{atau(r.no_kontrak)}</td>
                  <td>{tgl(r.tgl_kontrak)}</td>
                  <td><b>{r.unit}</b></td>
                  <td>{atau(r.nama_konsumen)}</td>
                  <td>{atau(r.marketing)}</td>
                  <td>{atau(r.kategori_marketing)}</td>
                  <td className="angka">{atau(r.luas_tanah)}</td>
                  <td className="angka">{atau(r.luas_bangunan)}</td>
                  <td>{atau(r.skema_cara_bayar)}</td>
                  <td>{r.status_unit}</td>
                  <td>{tgl(r.tgl_batal)}</td>
                  <td>{atau(r.type)}</td>
                  <td>{atau(r.arah_hadap)}</td>
                  <td className="angka">{rp(r.nilai_incl)}</td>
                  <td className="angka">{rp(r.nilai_excl)}</td>
                  <td className="angka">{rp(r.dpp_nilai_lain)}</td>
                  <td className="angka">{rp(r.penerimaan)}</td>
                  <td className="angka">{persen(r.penerimaan_persen)}</td>
                  <td className="angka">{persen(r.persen_overriding)}</td>
                  <td>{r.sign_ppjb ? "Sign" : "—"}</td>
                  <td>{atau(r.skema)}</td>
                  <td className="angka">{persen(r.persen_overriding)}</td>
                  <td className="angka">{rp(r.amount)}</td>
                  <td className="angka">{rp(r.dpp)}</td>
                  <td className="angka">{rp(r.ppn)}</td>
                  <td className="angka">{rp(r.pph23)}</td>
                  <td className="angka">{rp(r.net)}</td>
                  <td>{tgl(r.tgl_transfer)}</td>
                  <td className="angka">{rp(r.selisih_amount)}</td>
                  <td className="angka">{rp(r.selisih_pph21)}</td>
                  <td className="angka">{rp(r.selisih_net)}</td>
                  <td className="angka">{persen(r.selisih_persen)}</td>
                  <td>{atau(r.keterangan)}</td>
                </tr>
              ))}
              {/* colSpan dihitung dari daftar kolomnya, bukan ditulis sebagai
                  angka: menambah satu kolom lalu lupa membetulkan angkanya
                  menggeser seluruh baris TOTAL satu langkah, dan angkanya
                  berdiri di bawah judul yang salah tanpa ada yang keliru
                  terlihat. */}
              <tr className="total-bagian">
                <td colSpan={KOLOM.findIndex(
                  (k) => k.bawah === "Amount Unit (Rp.)")}>TOTAL</td>
                <td className="angka">{rp(b.total.amount)}</td>
                <td className="angka">{rp(b.total.dpp)}</td>
                <td className="angka">{rp(b.total.ppn)}</td>
                <td className="angka">{rp(b.total.pph23)}</td>
                <td className="angka">{rp(b.total.net)}</td>
                <td />
                <td className="angka">{rp(b.total.selisih_amount)}</td>
                <td className="angka">{rp(b.total.selisih_pph21)}</td>
                <td className="angka">{rp(b.total.selisih_net)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          ))}
        </table>
      </div>

      {rekap.catatan.length > 0 && (
        <div className="catatan-rekap">
          <b>Note:</b>
          <ul>
            {rekap.catatan.map((c, i) => (
              <li key={i}>
                {c.teks}
                {c.nilai !== null && <span className="nilai">{persen(c.nilai)}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lima blok tanda tangan, sebagaimana pada acuannya. Namanya sengaja
          tidak diisi: yang menandatangani berbeda menurut periodenya, dan nama
          yang tercetak sendiri mengundang lembar ditandatangani orang lain
          atas nama yang tertulis. */}
      <div className="ttd-rekap">
        {["Dibuat Oleh,", "Diperiksa Oleh,", "Disetujui Oleh,",
          "Disetujui Oleh,", "Disetujui Oleh,"].map((t, i) => (
          <div key={i}>
            <span className="peran">{t}</span>
            <div className="kotak-ttd" />
            <div className="garis-nama" />
          </div>
        ))}
      </div>
    </div>
  );
}
