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
 * Dibuat Oleh, Diperiksa Oleh, dan Disetujui Oleh — yang terakhir membentang
 * di atas dua ruang tanda tangan berdampingan.
 *
 * Tabelnya lebar — tiga puluh kolom lebih — jadi lembarnya melintang. Itu
 * memang bentuk aslinya; memaksanya tegak berarti mengecilkan hurufnya sampai
 * angka rupiah tidak lagi terbaca.
 */

import type { Rekap } from "@/lib/overriding";
import { penandatanganRekap } from "@/lib/penandatangan";

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

/** Bulan disingkat, untuk kolom tanggal di dalam tabel. */
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul",
                      "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Tanggal pada sel tabel: "20 Nov 2024", bukan "20 November 2024".
 *
 * Kolom tanggalnya selebar tiga puluh piksel di atas kertas, sedangkan
 * "November" sendirian meminta tiga puluh delapan. Nama bulan penuh di sana
 * tidak mengecil melainkan patah di tengah kata — "Nov / emb / er" — dan itu
 * yang terbaca di meja orang. Kepala lembarnya tetap memakai nama penuh:
 * di sana ruangnya memang ada.
 */
const tglPendek = (v?: string | null) => {
  if (!v) return "—";
  const [th, bl, hr] = String(v).slice(0, 10).split("-").map(Number);
  if (!th || !bl || !hr) return String(v).slice(0, 10);
  return `${hr} ${BULAN_PENDEK[bl - 1] ?? bl} ${th}`;
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
 * `lebar` dibaca sebagai LEBAR YANG DIMINTA DI ATAS KERTAS, dalam piksel pada
 * A4 melintang bermargin 0,5 inci — 1025px seluruhnya. Jumlahnya dinormalkan
 * menjadi persen pada colgroup, jadi angkanya tetap bekerja sebagai bobot;
 * yang berubah cara membacanya. Bobot tanpa satuan tidak dapat ditimbang
 * terhadap apa pun, sedangkan angka ini dapat: kolom rupiah diberi 50 karena
 * "1.878.240.000" bercetak tebal memakan 47px ditambah 4px sela, dan kolom
 * yang lebih kecil daripada kebutuhannya langsung terbaca di daftar ini.
 * Angka tidak pernah dipatahkan — .angka memakai white-space: nowrap — jadi
 * kolom rupiah yang kurang 4px tidak mengecilkan angkanya melainkan
 * menumpukkannya ke kolom sebelahnya.
 *
 * Lebarnya memang harus dipatok. Tiga puluh kolom pada satu lembar melintang
 * tidak muat bila lebarnya dibiarkan ditentukan isinya — yang terjadi bukan
 * mengecil, melainkan kolom paling kanan terdorong keluar halaman dan hilang
 * dari cetakan tanpa jejak apa pun di layar.
 *
 * Nama Konsumen serta Status (Unit dan Tgl. Batal) tidak ikut dicetak.
 * Ketiganya ada pada datanya dan tetap terbaca di layar Approval; pada
 * lembar ini ruang yang mereka pakai lebih berguna bagi kolom yang isinya
 * patah di tengah kata. Status unit pun sudah terbaca dari bagiannya:
 * barisnya berdiri di bawah judul BATAL, bukan di bawah PERIODE.
 *
 * Tiga judul disingkat — "Reg. / Prog.", "Tgl. Trf. OR", "Ket." — sebab
 * kolomnya hanya selebar isinya yang pendek, dan judul panjang di atas kolom
 * sempit tidak mengecil melainkan patah di tengah kata: "Ketera-ngan". Yang
 * dibaca orang pada lembar ini deretan angkanya; judulnya cukup dikenali.
 */
const KOLOM: { atas: string; bawah?: string; kelas?: string; lebar: number }[] = [
  { atas: "No.", lebar: 17, kelas: "angka" },
  { atas: "Tgl. Kontrak", lebar: 33 },
  { atas: "Unit", lebar: 45 },
  { atas: "Marketing", lebar: 41 },
  { atas: "Kategori Marketing", lebar: 39 },
  { atas: "Luas", bawah: "Tanah", kelas: "angka", lebar: 24 },
  { atas: "Luas", bawah: "Bangunan", kelas: "angka", lebar: 37 },
  { atas: "Skema Cara Bayar", lebar: 44 },
  { atas: "Type", lebar: 24 },
  // Satu sel yang membentang dua baris, bukan judul bertingkat: "(Include
  // PPN)" bukan salah satu dari beberapa kolom di bawah "Nilai Kontrak" —
  // ia keterangan dari kolom yang sama, dan garis mendatar di antara
  // keduanya membacanya seolah dua hal.
  { atas: "Nilai Kontrak (Include PPN)", kelas: "angka", lebar: 49 },
  { atas: "DPP Nilai Lain", kelas: "angka", lebar: 49 },
  { atas: "Penerimaan", bawah: "Rp.", kelas: "angka", lebar: 49 },
  { atas: "Penerimaan", bawah: "%", kelas: "angka", lebar: 31 },
  { atas: "Sign PPJB", lebar: 25 },
  { atas: "Skema Overiding", bawah: "Reg. / Prog.", lebar: 31 },
  { atas: "Skema Overiding", bawah: "%", kelas: "angka", lebar: 31 },
  { atas: "Skema Overiding", bawah: "Amount Unit (Rp.)", kelas: "angka", lebar: 49 },
  { atas: "Skema Overiding", bawah: "DPP Nilai Lain", kelas: "angka", lebar: 49 },
  { atas: "Skema Overiding", bawah: "PPN", kelas: "angka", lebar: 36 },
  { atas: "Skema Overiding", bawah: "PPh 23", kelas: "angka", lebar: 36 },
  { atas: "Skema Overiding", bawah: "Net", kelas: "angka", lebar: 49 },
  { atas: "Skema Overiding", bawah: "Tgl. Trf. OR", lebar: 28 },
  { atas: "Selisih Overiding", bawah: "Amount Unit (Rp.)", kelas: "angka", lebar: 49 },
  { atas: "Selisih Overiding", bawah: "PPh 21", kelas: "angka", lebar: 36 },
  { atas: "Selisih Overiding", bawah: "Net", kelas: "angka", lebar: 49 },
  { atas: "Selisih Overiding", bawah: "%", kelas: "angka", lebar: 31 },
  { atas: "Ket.", lebar: 41 },
];


/**
 * Kolom yang berjudul sama dan berdampingan, dikumpulkan menjadi satu kepala.
 *
 * Yang berjudul tunggal — tanpa judul bawah — membentang dua baris, sebab
 * tidak ada apa pun yang berdiri di bawahnya. Yang punya judul bawah tidak
 * pernah membentang: barisnya yang kedua ditempati judul bawahnya, dan
 * membentangkannya akan menggeser seluruh kolom sesudahnya satu langkah.
 */
function kumpulkan(kolom: typeof KOLOM) {
  return kolom.reduce<
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
}

/**
 * Lembar perhitungan: rekap Overriding, dan — dengan judul yang berbeda —
 * Detail Perhitungan Closing Fee, Cash Reward, dan Komisi.
 *
 * Satu komponen untuk keempatnya, sebab yang diperiksa memang kolom yang
 * sama: nilai kontrak, penerimaan, tarif, lalu DPP, PPN dan pajaknya. Yang
 * berganti hanya judul lembarnya, judul kelompok kolom skemanya, dan sebutan
 * orang yang menerimanya.
 */
export function RekapOverriding({ rekap, judul, labelSkema, labelPenerima,
                                 ttdMarketing, tanpaSelisih, tanpaCatatan,
                                 onKeterangan }: {
  rekap: Rekap; judul?: string; labelSkema?: string; labelPenerima?: string;
  /**
   * Nama yang membuat lembarnya, bila lembar ini hanya perlu satu tanda
   * tangan.
   *
   * Rekap Overriding beredar sampai direksi: ia ditandatangani Dibuat,
   * Diperiksa, dan dua Disetujui. Detail Perhitungan Closing Fee, Cash
   * Reward dan Komisi tidak — ia lampiran formulir yang sudah membawa blok
   * pengesahannya sendiri di halaman pertama, dan empat kolom tanda tangan
   * kedua kalinya hanya meminta empat orang yang sama menandatangani hal
   * yang sama dua kali.
   */
  ttdMarketing?: string | null;
  /**
   * Kelompok kolom "Selisih Overiding" dibuang.
   *
   * Selisih adalah bagian hak yang belum terbayar kepada tingkat di atas
   * penjualnya — pengertian yang hanya ada pada Overriding. Pada lembar
   * Closing Fee, Cash Reward dan Komisi keempat kolomnya selalu nol, dan
   * empat kolom nol pada tabel yang sudah harus dimampatkan ke selebar
   * kertas hanya memakan tempat kolom yang memang dibaca orang.
   */
  tanpaSelisih?: boolean;
  /**
   * Blok "Note:" di bawah tabel dibuang.
   *
   * Pada rekap Overriding ia mendaftar seluruh tarif yang berlaku — beberapa
   * baris, dan memang dibaca. Pada lembar satu unit ia hanya mengulang satu
   * tarif yang angkanya sudah berdiri di kolom % tepat di atasnya.
   */
  tanpaCatatan?: boolean;
  /**
   * Kolom Ket. menjadi isian, bukan tulisan.
   *
   * Diberikan hanya pada lembar yang memang boleh diisi tangan; tanpa itu
   * kolomnya tetap berupa tulisan, sebagaimana lembar yang dicetak.
   */
  onKeterangan?: (nilai: string) => void;
}) {
  const sm = rekap.sales_manager;
  const ttd = penandatanganRekap(rekap.project?.slug);
  const kolom = tanpaSelisih
    ? KOLOM.filter((k) => k.atas !== "Selisih Overiding") : KOLOM;
  const kumpulan = kumpulkan(kolom);
  const lebarTotal = kolom.reduce((t, k) => t + k.lebar, 0);
  return (
    <div className="cetak rekap-or">
      {/* Tanpa kop berisi nama PT di puncak lembar. Formulir pengajuan memang
          berkop — ia surat yang berdiri sendiri — sedangkan lembar ini
          lampiran perhitungan yang beredar bersama formulirnya, dan nama PT
          yang sama tercetak dua kali berturut-turut hanya memakan tinggi
          halaman yang justru sedang diperebutkan tabelnya.

          Tanpa nomor klaim di belakang judulnya. Yang menandai lembar ini
          bagi yang membacanya adalah klusternya, periodenya, dan nama Sales
          Manager-nya — ketiganya tertulis tepat di bawah sini. Nomor klaim
          penanda di dalam sistem, dan pada dokumen yang beredar ke tangan
          direksi ia hanya deret yang tidak berarti apa-apa. */}
      <h2 className="judul-rekap">
        {judul ?? "Detail Perhitungan Overiding"}
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
          memakan kolom yang sudah sempit.

          Jabatan di atas nama, bertumpuk, bukan berjajar: begitulah kepala
          rekap ini ditulis pada Excel-nya. Jenis pemasarnya — Inhouse atau
          Agent — sengaja tidak ikut: ia keterangan orang, bukan keterangan
          rekap, dan pada kepala dokumen ia hanya ramai. */}
      <div className="sm-rekap">
        <span>{labelPenerima ?? "Sales Manager"}</span>
        <b>{atau(sm?.full_name)}</b>
      </div>

      <div className="tscroll">
        <table className="tabel-rekap">
          <colgroup>
            {kolom.map((k, i) => (
              <col key={i}
                   style={{ width: `${(k.lebar / lebarTotal * 100).toFixed(3)}%` }} />
            ))}
          </colgroup>
          {/* Judul bertingkat: yang berjudul sama dan berdampingan digabung
              menjadi satu kepala yang membentang di atasnya — "Skema
              Overiding" ditulis sekali untuk delapan kolomnya, bukan delapan
              kali pada kolom selebar dua kata. */}
          <thead>
            <tr>
              {kumpulan.map((g, i) => (
                <th key={i} className={g.kelas}
                    colSpan={g.jumlah > 1 ? g.jumlah : undefined}
                    rowSpan={g.bertingkat ? undefined : 2}>
                  {labelSkema && g.atas === "Skema Overiding"
                    ? labelSkema : g.atas}
                </th>
              ))}
            </tr>
            <tr>
              {kolom.filter((k) => k.bawah).map((k, i) => (
                <th key={i} className={k.kelas}>
                  <span className="sub">{k.bawah}</span>
                </th>
              ))}
            </tr>
          </thead>

          {rekap.bagian.map((b) => (
            <tbody key={b.judul}>
              <tr className="judul-bagian">
                <td colSpan={kolom.length}>{b.judul}</td>
              </tr>
              {b.baris.map((r) => (
                <tr key={`${b.judul}:${r.unit}:${r.no}`}>
                  <td className="angka">{r.no}</td>
                  <td>{tglPendek(r.tgl_kontrak)}</td>
                  <td><b>{r.unit}</b></td>
                  <td>{atau(r.marketing)}</td>
                  <td>{atau(r.kategori_marketing)}</td>
                  <td className="angka">{atau(r.luas_tanah)}</td>
                  <td className="angka">{atau(r.luas_bangunan)}</td>
                  <td>{atau(r.skema_cara_bayar)}</td>
                  <td>{atau(r.type)}</td>
                  <td className="angka">{rp(r.nilai_incl)}</td>
                  <td className="angka">{rp(r.dpp_nilai_lain)}</td>
                  <td className="angka">{rp(r.penerimaan)}</td>
                  <td className="angka">{persen(r.penerimaan_persen)}</td>
                  <td>{r.sign_ppjb ? "Sign" : "—"}</td>
                  <td>{atau(r.skema)}</td>
                  <td className="angka">{persen(r.persen_overriding)}</td>
                  <td className="angka">{rp(r.amount)}</td>
                  <td className="angka">{rp(r.dpp)}</td>
                  <td className="angka">{rp(r.ppn)}</td>
                  <td className="angka">{rp(r.pph23)}</td>
                  <td className="angka">{rp(r.net)}</td>
                  <td>{tglPendek(r.tgl_transfer)}</td>
                  {!tanpaSelisih && (
                    <>
                      <td className="angka">{rp(r.selisih_amount)}</td>
                      <td className="angka">{rp(r.selisih_pph21)}</td>
                      <td className="angka">{rp(r.selisih_net)}</td>
                      <td className="angka">{persen(r.selisih_persen)}</td>
                    </>
                  )}
                  {/* Ket. diisi tangan bila lembarnya mengizinkan: yang
                      ditulis di sana keterangan pengajuan ini, dan tidak ada
                      sumbernya di basis data. Saat dicetak, kotaknya tidak
                      bergaris — lihat .isi-ket pada globals.css. */}
                  <td>
                    {onKeterangan ? (
                      <input className="isi-ket" defaultValue={r.keterangan ?? ""}
                             placeholder="Isi Data" maxLength={200}
                             onBlur={(e) => onKeterangan(e.target.value)} />
                    ) : atau(r.keterangan)}
                  </td>
                </tr>
              ))}
              {/* colSpan dihitung dari daftar kolomnya, bukan ditulis sebagai
                  angka: menambah satu kolom lalu lupa membetulkan angkanya
                  menggeser seluruh baris TOTAL satu langkah, dan angkanya
                  berdiri di bawah judul yang salah tanpa ada yang keliru
                  terlihat. */}
              <tr className="total-bagian">
                <td colSpan={kolom.findIndex(
                  (k) => k.bawah === "Amount Unit (Rp.)")}>TOTAL</td>
                <td className="angka">{rp(b.total.amount)}</td>
                <td className="angka">{rp(b.total.dpp)}</td>
                <td className="angka">{rp(b.total.ppn)}</td>
                <td className="angka">{rp(b.total.pph23)}</td>
                <td className="angka">{rp(b.total.net)}</td>
                <td />
                {!tanpaSelisih && (
                  <>
                    <td className="angka">{rp(b.total.selisih_amount)}</td>
                    <td className="angka">{rp(b.total.selisih_pph21)}</td>
                    <td className="angka">{rp(b.total.selisih_net)}</td>
                  </>
                )}
                {/* Kolom Selisih % dan Ket. dibiarkan kosong; tanpa kelompok
                    Selisih, yang tersisa Ket. saja. */}
                <td colSpan={tanpaSelisih ? 1 : 2} />
              </tr>
            </tbody>
          ))}
        </table>
      </div>

      {!tanpaCatatan && rekap.catatan.length > 0 && (
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

      {/* Empat ruang tanda tangan, tiga sebutan.

          Sebutan ketiga — "Disetujui Oleh," — membentang di atas dua ruang
          terakhir dan berdiri di tengah keduanya: yang menyetujui rekap ini
          dua orang yang menandatangani berdampingan, bukan dua jabatan yang
          masing-masing perlu disebut. Acuannya menulisnya tiga kali; dua di
          antaranya dibuang atas permintaan kantor.

          Karena itu barisnya dua: sebaris sebutan, sebaris ruang tanda
          tangannya. Sebutan yang membentang tidak dapat digambar sebagai
          bagian dari satu blok — ia harus melintasi dua lajur sekaligus, dan
          hanya petak yang dapat melakukannya.

          Namanya dicetak di atas garisnya, ditentukan projectnya — lihat
          penandatanganRekap(). Yang kosong tetap bergaris: pemeriksanya belum
          ditetapkan untuk sebagian project, dan garis tanpa nama masih dapat
          diisi tangan, sedangkan nama yang ditebak tidak dapat ditarik kembali
          setelah lembarnya beredar. */}
      {ttdMarketing !== undefined ? (
        <div className="ttd-tunggal">
          <span className="peran">Dibuat Oleh,</span>
          <div className="kotak-ttd" />
          <span className="nama-ttd">{ttdMarketing || "\u00A0"}</span>
          <div className="garis-nama" />
        </div>
      ) : (
        <div className="ttd-rekap">
          <span className="peran">Dibuat Oleh,</span>
          <span className="peran">Diperiksa Oleh,</span>
          <span className="peran dua">Disetujui Oleh,</span>
          {[ttd.dibuat, ttd.diperiksa, ttd.disetujui[0], ttd.disetujui[1]]
            .map((nama, i) => (
            <div key={i}>
              <div className="kotak-ttd" />
              {/* Spasi mati, bukan span hampa: yang hampa tidak setinggi apa
                  pun, dan garis di bawahnya naik sebaris lebih tinggi
                  daripada tetangganya yang bernama. */}
              <span className="nama-ttd">{nama || "\u00A0"}</span>
              <div className="garis-nama" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
