/**
 * Aritmetika uang.
 *
 * Uang selalu bilangan bulat rupiah, diwakili `number` (aman sampai 2^53, jauh di
 * atas nilai kontrak properti mana pun). Persentase tidak pernah menyentuh
 * floating point: nilainya datang dari PostgreSQL sebagai string NUMERIC(12,8) dan
 * dikalikan memakai BigInt berskala.
 *
 * Alasannya konkret. Tarif overriding 0,25% atas nilai kontrak Rp 185.000.000
 * dihitung dengan `185_000_000 * 0.0025` menghasilkan 462499.99999999994 pada
 * IEEE-754. Dibulatkan memang menghasilkan 462.500, tetapi pada tarif dan nilai
 * lain selisihnya muncul sebagai rupiah yang hilang — kecil per transaksi, tidak
 * pernah nol saat direkonsiliasi setahun.
 */

const SCALE = 8n;
const SCALE_FACTOR = 10n ** SCALE;

/** Ubah string desimal ("0.0025") menjadi BigInt berskala 10^8. */
export function toScaled(decimal: string | number): bigint {
  const s = String(decimal).trim();
  const neg = s.startsWith("-");
  const [intPart, fracRaw = ""] = (neg ? s.slice(1) : s).split(".");
  const frac = (fracRaw + "0".repeat(Number(SCALE))).slice(0, Number(SCALE));
  const value = BigInt(intPart || "0") * SCALE_FACTOR + BigInt(frac || "0");
  return neg ? -value : value;
}

/** Bulatkan half-up ke rupiah penuh. Satu-satunya tempat pembulatan terjadi. */
function roundHalfUp(numerator: bigint, denominator: bigint): number {
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const r = n % d;
  const rounded = r * 2n >= d ? q + 1n : q;
  return Number(neg ? -rounded : rounded);
}

/** basis (rupiah bulat) x persentase desimal -> rupiah bulat. */
export function applyRate(basis: number, rate: string | number): number {
  if (!Number.isInteger(basis)) {
    throw new Error(`Basis perhitungan harus bilangan bulat rupiah, diterima ${basis}`);
  }
  return roundHalfUp(BigInt(basis) * toScaled(rate), SCALE_FACTOR);
}

/** nilai termasuk PPN -> nilai belum termasuk PPN, dibulatkan ke rupiah. */
export function stripVat(inclusive: number, vatRate: string | number): number {
  const r = toScaled(vatRate);
  if (r === 0n) return inclusive;
  return roundHalfUp(BigInt(inclusive) * SCALE_FACTOR, SCALE_FACTOR + r);
}

/** Rasio dua nilai rupiah sebagai string desimal 8 angka di belakang koma. */
export function ratio(part: number, whole: number): string {
  if (!whole) return "0.00000000";
  const scaled = (BigInt(part) * SCALE_FACTOR) / BigInt(whole);
  const s = scaled.toString().padStart(Number(SCALE) + 1, "0");
  return `${s.slice(0, -Number(SCALE))}.${s.slice(-Number(SCALE))}`;
}

const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

export function terbilang(n: number): string {
  if (n < 0) return `minus ${terbilang(-n)}`;
  if (n < 12) return n === 0 ? "nol" : SATUAN[n];
  if (n < 20) return `${terbilang(n - 10)} belas`;
  if (n < 100) {
    const rest = n % 10;
    return `${terbilang(Math.floor(n / 10))} puluh${rest ? ` ${terbilang(rest)}` : ""}`;
  }
  if (n < 200) return `seratus${n > 100 ? ` ${terbilang(n - 100)}` : ""}`;
  if (n < 1000) {
    const rest = n % 100;
    return `${terbilang(Math.floor(n / 100))} ratus${rest ? ` ${terbilang(rest)}` : ""}`;
  }
  if (n < 2000) return `seribu${n > 1000 ? ` ${terbilang(n - 1000)}` : ""}`;
  for (const [limit, word] of [
    [1_000_000, "ribu"], [1_000_000_000, "juta"],
    [1_000_000_000_000, "miliar"],
  ] as [number, string][]) {
    if (n < limit) {
      const div = limit / 1000;
      const rest = n % div;
      return `${terbilang(Math.floor(n / div))} ${word}${rest ? ` ${terbilang(rest)}` : ""}`;
    }
  }
  const rest = n % 1_000_000_000_000;
  return `${terbilang(Math.floor(n / 1_000_000_000_000))} triliun${
    rest ? ` ${terbilang(rest)}` : ""}`;
}

export function rupiahWords(n: number): string {
  const t = terbilang(Math.round(n)).trim();
  return t ? `${t[0].toUpperCase()}${t.slice(1)} rupiah` : "Nol rupiah";
}

export function formatRupiah(n: number | null | undefined): string {
  return `Rp ${(n ?? 0).toLocaleString("id-ID")}`;
}
