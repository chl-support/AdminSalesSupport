"use client";

/**
 * Tebal, miring, dan garis bawah pada isian tulisan Pricelist (mis. catatan
 * T&C). Kotak isian biasa tidak dapat menyimpan format, jadi tulisannya
 * ditandai: [b]tebal[/b], [i]miring[/i], [u]garis bawah[/u] — tanda yang
 * tidak bentrok dengan tulisan biasa (mis. "*besaran DP …"). Tandanya
 * terlihat saat disunting dan berubah menjadi format saat dicetak.
 */

import { Fragment, useEffect, useRef } from "react";

type Gaya = "b" | "i" | "u";
const TANDA = /\[(\/?)([biu])\]/g;

/** Tulisan bertanda → elemen bergaya. Tanda yang tidak berpasangan diabaikan. */
export function TeksBergaya({ teks }: { teks: string | null | undefined }) {
  const s = teks ?? "";
  if (!s.includes("[")) return <>{s}</>;
  const aktif: Record<Gaya, number> = { b: 0, i: 0, u: 0 };
  const potong: { t: string; g: Record<Gaya, boolean> }[] = [];
  let akhir = 0;
  for (const m of s.matchAll(TANDA)) {
    if (m.index! > akhir) potong.push({ t: s.slice(akhir, m.index), g: { b: !!aktif.b, i: !!aktif.i, u: !!aktif.u } });
    const g = m[2] as Gaya;
    aktif[g] = Math.max(0, aktif[g] + (m[1] ? -1 : 1));
    akhir = m.index! + m[0].length;
  }
  if (akhir < s.length) potong.push({ t: s.slice(akhir), g: { b: !!aktif.b, i: !!aktif.i, u: !!aktif.u } });
  return (
    <>
      {potong.map((p, i) => {
        let el: React.ReactNode = p.t;
        if (p.g.u) el = <u>{el}</u>;
        if (p.g.i) el = <i>{el}</i>;
        if (p.g.b) el = <b>{el}</b>;
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

/** Tulisan tanpa tanda gaya (mis. untuk kunci pencocokan atau ringkasan). */
export const tanpaGaya = (s: string) => s.replace(TANDA, "");

/** Kotak tulisan yang boleh diberi gaya: bukan kotak angka. */
const bolehGaya = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el instanceof HTMLTextAreaElement
    || (el instanceof HTMLInputElement && el.type === "text" && !el.readOnly
        && !["decimal", "numeric"].includes(el.inputMode)
        && !el.closest(".isian-angka")))
  && !(el as HTMLInputElement).disabled;

/**
 * Tombol B / I / U: memberi tanda gaya pada tulisan yang dipilih di kotak
 * isian yang terakhir disorot. Nilai diganti lewat setter bawaan lalu
 * peristiwa "input", supaya onChange React ikut berjalan.
 */
export function BilahGaya() {
  const terakhir = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const ingat = (e: FocusEvent) => { if (bolehGaya(e.target as Element)) terakhir.current = e.target as any; };
    document.addEventListener("focusin", ingat);
    return () => document.removeEventListener("focusin", ingat);
  }, []);

  const terapkan = (g: Gaya) => {
    const el = terakhir.current;
    if (!el || !document.contains(el)) return;
    const [a, z] = [el.selectionStart ?? 0, el.selectionEnd ?? 0];
    const v = el.value;
    const pilih = v.slice(a, z) || "tulisan";
    const baru = `${v.slice(0, a)}[${g}]${pilih}[/${g}]${v.slice(z)}`;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
    setter.call(el, baru);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    const awal = a + g.length + 2;
    el.setSelectionRange(awal, awal + pilih.length);
  };

  // onMouseDown dicegah supaya sorotan dan pilihan di kotak isian tidak hilang.
  const tombol = (g: Gaya, isi: React.ReactNode, judul: string) => (
    <button type="button" className="kecil" title={judul} aria-label={judul}
            onMouseDown={(e) => e.preventDefault()} onClick={() => terapkan(g)}>{isi}</button>
  );
  return (
    <span className="bilah-gaya">
      <span className="hint" style={{ margin: 0 }}>Format tulisan:</span>
      {tombol("b", <b>B</b>, "Tebal — pilih tulisan di kotak isian, lalu klik")}
      {tombol("i", <i>I</i>, "Miring — pilih tulisan di kotak isian, lalu klik")}
      {tombol("u", <u>U</u>, "Garis bawah — pilih tulisan di kotak isian, lalu klik")}
      <span className="hint" style={{ margin: 0 }}>
        pilih tulisan di kotak isian lalu klik; hasilnya terlihat saat dicetak
      </span>
    </span>
  );
}
