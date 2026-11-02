"use client";

/**
 * Status jual unit — Available atau Sold — untuk kolom Status pada langkah
 * 4a dan 4b.
 *
 * Angkanya tidak diketik di layar Harga: ia dibaca dari Data Penjualan yang
 * sudah ada, sehingga daftar harga dan daftar penjualan tidak pernah
 * berselisih karena ada yang lupa memperbaruinya.
 */

import { useEffect, useState } from "react";

import { useKata } from "../bahasa";

export type StatusUnit = {
  code: string; status: string; buyer_name: string | null;
  contract_date: string | null; contract_number: string | null;
};

const KATA = {
  id: {
    thStatus: "Status",
    tersedia: "Available", terjual: "Sold", management: "Management",
    sejak: (t: string) => `sejak ${t}`,
    infoTersedia: "Belum ada pesanan yang berlaku pada Data Penjualan",
    infoManagement: "Unit milik management — tidak ditawarkan",
  },
  en: {
    thStatus: "Status",
    tersedia: "Available", terjual: "Sold", management: "Management",
    sejak: (t: string) => `since ${t}`,
    infoTersedia: "No active booking in the sales data",
    infoManagement: "Held by management — not offered",
  },
};

/** Kode unit disamakan bentuknya: Data Penjualan dan pricelist kerap beda huruf. */
export const kunciUnit = (kode: string) => kode.trim().toUpperCase();

/**
 * Status tiap unit pada proyek yang sedang dibuka, berindeks kode unit.
 * Kosong bila belum termuat atau proyeknya belum punya Data Penjualan.
 */
export function useStatusUnit(): Record<string, StatusUnit> {
  const [peta, setPeta] = useState<Record<string, StatusUnit>>({});
  useEffect(() => {
    let hidup = true;
    fetch("/api/pricelist/status-unit")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (!hidup || !b?.unit) return;
        setPeta(Object.fromEntries(
          (b.unit as StatusUnit[]).map((x) => [kunciUnit(x.code), x])));
      })
      .catch(() => { /* status tidak terbaca: kolomnya menyebut Available */ });
    return () => { hidup = false; };
  }, []);
  return peta;
}

/** Satu sel status, beserta keterangan pembelinya pada tooltip. */
export function SelStatus({ s }: { s?: StatusUnit }) {
  const k = useKata(KATA);
  if (!s) {
    return <span className="pill ok" title={k.infoTersedia}>{k.tersedia}</span>;
  }
  if (s.status === "management") {
    return <span className="pill" title={k.infoManagement}>{k.management}</span>;
  }
  const tgl = s.contract_date ? String(s.contract_date).slice(0, 10) : null;
  const judul = [s.buyer_name, s.contract_number, tgl && k.sejak(tgl)]
    .filter(Boolean).join(" · ");
  return <span className="pill stop" title={judul || undefined}>{k.terjual}</span>;
}

export const KATA_STATUS = KATA;
