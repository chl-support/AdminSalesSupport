/**
 * Beranda: langsung ke layar Ajukan klaim.
 *
 * Yang dikerjakan tiap hari adalah mengajukan klaim; konsol dibuka untuk
 * menindaklanjuti yang sudah ada. Sebelumnya konsol yang menempati "/" — jadi
 * siapa pun yang mengetik alamat situsnya, atau masuk dari tautan tanpa ?next,
 * mendarat di layar yang bukan pekerjaannya.
 *
 * Pengalihan, bukan salinan layar Ajukan klaim: dua alamat yang menampilkan
 * layar yang sama akan berbeda isi cepat atau lambat.
 */

import { redirect } from "next/navigation";

export default function Beranda() {
  redirect("/klaim");
}
