/**
 * Menebak nama pemilik, bank, dan nomor rekening dari buku rekening yang
 * diunggah.
 *
 * Tiga kolom itu sebelumnya diketik ulang dari buku tabungan atau kartu ATM
 * yang sedang dipegang. Nomor rekening panjang dan tanpa arti — satu digit
 * yang tertukar tidak terlihat oleh siapa pun yang membacanya kembali, dan
 * baru ketahuan saat transfernya gagal atau, lebih buruk, berhasil ke rekening
 * orang lain.
 *
 * Hasilnya **usulan**, bukan keputusan. Kolomnya tetap dapat disunting, dan
 * yang mengajukan tetap membacanya sebelum mengirim. Karena itu fungsi ini
 * tidak pernah melempar galat: buku rekening yang tidak terbaca mengembalikan
 * kolom kosong, dan layar mengatakannya apa adanya — bukan menebak-nebak isi
 * yang tidak ditemukannya.
 */

export type Rekening = {
  holder_name: string | null;
  bank_name: string | null;
  account_number: string | null;
};

/**
 * Bank yang dikenali, beserta ejaan lain yang muncul di buku rekening.
 *
 * Yang disimpan pada klaim adalah nama bakunya, bukan apa pun yang kebetulan
 * tercetak: "BANK CENTRAL ASIA", "PT BCA Tbk", dan "BCA" adalah bank yang
 * sama, dan tersimpan dalam tiga ejaan ia terbaca sebagai tiga bank saat
 * Finance menyiapkan transfernya.
 */
const BANK: { nama: string; pola: RegExp }[] = [
  { nama: "BCA", pola: /\b(BCA|BANK\s+CENTRAL\s+ASIA)\b/i },
  { nama: "Mandiri", pola: /\bBANK\s+MANDIRI\b|\bMANDIRI\b/i },
  { nama: "BNI", pola: /\b(BNI|BANK\s+NEGARA\s+INDONESIA)\b/i },
  { nama: "BRI", pola: /\b(BRI|BANK\s+RAKYAT\s+INDONESIA|BRITAMA|SIMPEDES)\b/i },
  { nama: "BTN", pola: /\b(BTN|BANK\s+TABUNGAN\s+NEGARA)\b/i },
  { nama: "BSI", pola: /\b(BSI|BANK\s+SYARIAH\s+INDONESIA)\b/i },
  { nama: "CIMB Niaga", pola: /\bCIMB\b|\bNIAGA\b/i },
  { nama: "Permata", pola: /\bPERMATA\b/i },
  { nama: "Danamon", pola: /\bDANAMON\b/i },
  { nama: "Panin", pola: /\bPANIN\b/i },
  { nama: "OCBC", pola: /\bOCBC\b|\bNISP\b/i },
  { nama: "Maybank", pola: /\bMAYBANK\b/i },
  { nama: "Mega", pola: /\bBANK\s+MEGA\b/i },
  { nama: "Sinarmas", pola: /\bSINARMAS\b/i },
  { nama: "BJB", pola: /\b(BJB|BANK\s+JABAR)\b/i },
  { nama: "DBS", pola: /\bDBS\b/i },
  { nama: "UOB", pola: /\bUOB\b/i },
  { nama: "HSBC", pola: /\bHSBC\b/i },
  { nama: "BTPN", pola: /\b(BTPN|JENIUS)\b/i },
  { nama: "Muamalat", pola: /\bMUAMALAT\b/i },
  { nama: "Bukopin", pola: /\bBUKOPIN\b/i },
];

/**
 * Kata yang lazim tercetak pada buku rekening tetapi bukan nama orang.
 *
 * Tanpa daftar ini, baris berhuruf besar pertama yang ditemukan hampir selalu
 * "BUKU TABUNGAN" atau alamat kantor cabangnya.
 */
const BUKAN_NAMA = new RegExp(
  "\\b(BANK|BUKU|TABUNGAN|REKENING|ACCOUNT|SAVING|SAVINGS|CABANG|BRANCH|" +
  "KANTOR|ALAMAT|ADDRESS|JALAN|JL|KOTA|PROVINSI|INDONESIA|NASABAH|" +
  "CUSTOMER|NOMOR|NOMER|NO|NIK|NPWP|TANGGAL|DATE|SALDO|BALANCE|MUTASI|" +
  "TELP|TELEPON|FAX|KODE|CIF|ATM|DEBIT|CREDIT|VALUTA|IDR|RP|" +
  // Tulisan pada kartu, dan nama produk tabungan. Keduanya berhuruf besar
  // seperti nama pemilik, dan tanpa disebut di sini "VALID THRU" terbaca
  // sebagai nama orang.
  "VALID|THRU|EXP|MEMBER|SINCE|PRIORITY|PLATINUM|GOLD|SILVER|" +
  "TAHAPAN|TAPLUS|SIMPEDES|BRITAMA|XPRESI|GIRO|DEPOSITO|BATARA)\\b", "i");

/** Baris yang sudah dibersihkan dari sisa OCR yang tidak berarti. */
function baris(teks: string): string[] {
  return String(teks ?? "")
    .split(/\r?\n/)
    .map((b) => b.replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Nomor rekening: deretan angka terpanjang yang masuk akal.
 *
 * Panjangnya 8 sampai 20 digit — di bawah itu ia lebih mungkin kode cabang
 * atau tanggal, di atasnya nomor kartu yang bukan nomor rekeningnya. Titik,
 * tanda hubung, dan spasi di tengahnya dibuang: bank menuliskan nomor yang
 * sama dengan pemisah yang berbeda-beda, dan yang ditransfer adalah angkanya.
 */
function nomorRekening(daftar: string[]): string | null {
  let terbaik: string | null = null;
  for (const b of daftar) {
    // Tanggal dilewati utuh: 12-08-2019 tanpa pemisah menjadi 12082019, yang
    // panjangnya persis nomor rekening dan tidak tertolak oleh apa pun.
    const tanpaTanggal = b.replace(
      /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, " ");
    for (const cocok of tanpaTanggal.matchAll(/\d[\d\s.\-]{6,}\d/g)) {
      const angka = cocok[0].replace(/\D/g, "");
      if (angka.length < 8 || angka.length > 20) continue;
      if (/^(\d)\1+$/.test(angka)) continue;
      if (!terbaik || angka.length > terbaik.length) terbaik = angka;
    }
  }
  return terbaik;
}

/** Nama bank, menurut ejaan bakunya. */
function namaBank(teks: string): string | null {
  for (const b of BANK) if (b.pola.test(teks)) return b.nama;
  return null;
}

/**
 * Nama pemilik rekening.
 *
 * Dicari dua kali. Pertama pada baris yang memang menyebutkannya — "Nama",
 * "A/N", "Atas Nama" — karena di situ namanya berdiri sendiri. Bila tidak
 * ada, baris berhuruf besar yang bukan nama bank dan bukan kata baku buku
 * rekening; itulah bentuk nama pemilik pada kartu ATM dan halaman muka buku
 * tabungan.
 */
function namaPemilik(daftar: string[]): string | null {
  const bersih = (v: string) =>
    v.replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z.'\- ]+$/, "").trim();

  for (const b of daftar) {
    const cocok = b.match(
      /\b(?:NAMA(?:\s+NASABAH|\s+PEMILIK)?|ATAS\s+NAMA|A\.?\/?N)\b\s*[:.]?\s*(.+)/i);
    if (!cocok) continue;
    const nama = bersih(cocok[1]);
    if (nama.length >= 3 && !BUKAN_NAMA.test(nama)) return rapikan(nama);
  }

  for (const b of daftar) {
    const nama = bersih(b);
    if (nama.length < 5 || nama.split(/\s+/).length < 2) continue;
    if (BUKAN_NAMA.test(nama) || namaBank(nama)) continue;
    // Huruf besar seluruhnya: itulah cara nama pemilik dicetak, dan
    // pembatasan ini yang menyingkirkan kalimat keterangan di sekitarnya.
    if (nama !== nama.toUpperCase()) continue;
    return rapikan(nama);
  }
  return null;
}

/**
 * Nama orang dengan huruf besar di awal tiap kata.
 *
 * Buku rekening mencetaknya kapital seluruhnya; formulir pengajuan yang
 * mencetak "AGNES RINI TRI FORESTIANTI" di antara kalimat berhuruf kecil
 * terbaca seperti teriakan, dan bukan begitu nama ditulis pada dokumen resmi.
 */
function rapikan(nama: string): string {
  return nama.toLowerCase().replace(/(^|[\s.'-])([a-z])/g,
    (_, pemisah, huruf) => pemisah + huruf.toUpperCase());
}

/**
 * Tiga kolom tujuan transfer, sejauh yang terbaca.
 *
 * Kolom yang tidak ditemukan dikembalikan null, bukan tebakan asal: kolom
 * kosong menyuruh orang mengisinya, tebakan yang keliru tidak.
 */
export function bacaBukuRekening(teks: string): Rekening {
  const daftar = baris(teks);
  const semua = daftar.join("\n");
  return {
    holder_name: namaPemilik(daftar),
    bank_name: namaBank(semua),
    account_number: nomorRekening(daftar),
  };
}
