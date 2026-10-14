/**
 * Sapaan menurut jam: Pagi, Siang, Sore, atau Malam.
 *
 * Pembagiannya mengikuti kebiasaan sehari-hari di Indonesia, bukan pembagian
 * hari yang mana pun: pagi sampai pukul sepuluh, siang sampai pukul dua, sore
 * sampai menjelang maghrib, sesudah itu malam — termasuk dini hari, yang
 * disapa "malam" oleh siapa pun yang masih terjaga pada jam itu.
 *
 * Berdiri sebagai berkas tersendiri supaya ia dapat diuji tanpa membuka layar
 * mana pun: yang menentukan isinya cuma satu angka, dan batas-batasnya justru
 * bagian yang paling mudah bergeser satu jam tanpa ada yang menyadarinya.
 *
 * Jamnya dibaca dari peramban Admin yang mengirimkan, bukan dari jam server:
 * server berjalan di zona waktu yang bukan zona waktu siapa pun di kantor ini,
 * dan sapaan yang dihitung di sana akan menyebut "pagi" pada sore hari.
 */
export function sapaanJam(jam: number): string {
  if (jam >= 5 && jam <= 10) return "Pagi";
  if (jam >= 11 && jam <= 14) return "Siang";
  if (jam >= 15 && jam <= 18) return "Sore";
  return "Malam";
}
