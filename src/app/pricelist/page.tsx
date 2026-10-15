"use client";

/**
 * Pricelist — butir menunya saja, halamannya sengaja masih kosong.
 *
 * Isi pricelist (yang berlaku beserta riwayat unggahannya) tampil di layar
 * Simulasi / NPV, di bawah panel Upload D-Pricelist (lihat
 * ./panel-pricelist.tsx). Atas permintaan pemakainya, menu Pricelist tetap
 * ada sebagai tempat dan halamannya dibiarkan kosong sampai nanti diisi.
 */

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";

const KATA = {
  id: { judul: "Pricelist" },
  en: { judul: "Price List" },
};

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>{null}</Kerangka>;
}
