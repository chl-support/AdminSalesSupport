import { redirect } from "next/navigation";

/**
 * Pricelist kini tampil di layar Simulasi / NPV, di bawah panel Upload
 * D-Pricelist (lihat ./panel-pricelist.tsx). Alamat lama ini tetap ada supaya
 * tautan dan markah yang tersimpan tidak berakhir di halaman kosong.
 */
export default function PricelistPage() {
  redirect("/simulasi");
}
