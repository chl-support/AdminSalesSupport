"use client";

/**
 * Pricelist — yang berlaku untuk project terpilih, beserta riwayat unggahannya.
 *
 * Isinya ada di ./panel-pricelist.tsx. Unggahannya dilakukan di layar
 * Simulasi / NPV; di sini pricelist dapat dibuka, diunduh, diberlakukan
 * kembali, atau dihapus.
 */

import { useState } from "react";

import { useKata } from "../bahasa";
import { Kerangka, MemeriksaSesi } from "../kerangka";
import { useSesi } from "../session";
import { PanelPricelist } from "./panel-pricelist";

const KATA = {
  id: {
    judul: "Pricelist",
    unggahDi: "Pricelist baru diunggah di layar ",
    keSimulasi: "Simulasi / NPV",
    pilihProject: "Pilih project lebih dulu.",
  },
  en: {
    judul: "Price List",
    unggahDi: "New price lists are uploaded on the screen ",
    keSimulasi: "Simulation / NPV",
    pilihProject: "Select a project first.",
  },
};

export default function PricelistPage() {
  const { sesi, memuat } = useSesi();
  const k = useKata(KATA);
  const [versi] = useState(0);

  if (memuat || !sesi) return <MemeriksaSesi />;

  return (
    <Kerangka sesi={sesi} lebar judul={<div><h1>{k.judul}</h1></div>}>
      {!sesi.project_slug ? (
        <div className="banner warn">{k.pilihProject}</div>
      ) : (
        <>
          <p className="hint" style={{ textAlign: "left", marginTop: 0 }}>
            {k.unggahDi}<a href="/simulasi">{k.keSimulasi}</a>.
          </p>
          <PanelPricelist sesi={sesi} versi={versi} />
        </>
      )}
    </Kerangka>
  );
}
