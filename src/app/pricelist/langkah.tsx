"use client";

/**
 * Kelima langkah penyusunan pricelist, masing-masing satu komponen yang
 * menerima isian lengkap (`data`), hasil hitungannya (`hasil`), dan cara
 * mengubahnya (`ubah`). Hitungannya ada di src/lib/susun-pricelist.ts dan
 * dijalankan ulang oleh halamannya setiap kali satu angka berubah, sehingga
 * langkah sesudahnya selalu membaca angka terbaru — seperti rumus Excel yang
 * saling merujuk antarlembar.
 */

import { useEffect, useState } from "react";

import { formatRupiah } from "@/lib/money";
import {
  FAKTOR, faktorTampil, hargaKasIrr, hargaSesuaiSkema, labelPpn, namaTahap, tarifPpn, unitKosong,
  kunciTnc, tingkatNaik, type BarisTnc, type KunciFaktor, type HasilSusun, type SusunPricelist, type UnitData,
} from "@/lib/susun-pricelist";
import type { UnitHarga } from "@/lib/simulasi";
import { useKata } from "../bahasa";
import { KUNCI, type Isi } from "./lembar-harga";
import { PilihBerkas } from "../pilih-berkas";
import { TabelHarga } from "../simulasi/unggah-pricelist";

/**
 * Kata-kata layar kelima langkah. Satu kamus untuk seluruh berkas; tiap
 * komponen memanggil useKata(KATA) sendiri dan menamainya `kt` (bukan `k`,
 * yang di berkas ini sudah dipakai sebagai nama kolom di banyak pemetaan).
 */
const KATA = {
  id: {
    // Umum
    yaHapus: "Ya, hapus", batal: "Batal", hapus: "Hapus", simpan: "Simpan",
    hapusNama: (n: string) => `Hapus ${n}`,
    tambahCb: "+ Tambah cara bayar",
    mengunggah: "Mengunggah…", tambahGambar: "+ Tambah gambar",
    bukaGambar: "Buka gambar ukuran penuh",
    cetakA4: "🖨 Cetak A4",
    catatan: "Catatan",
    // 1. Data (IRR)
    irrHint: "Koefisien tiap cara bayar adalah harga yang membuat IRR arus kasnya sama dengan bunga target, dibagi harga Cash Keras. DP dicicil rata pada bulan 1 sampai n; sisanya (1 − DP) cair pada bulan tiap tahap pembangunan.",
    target: "Target bunga (setahun)",
    porsi: (t: string) => `Porsi ${t}`,
    porsi100: "Jumlah porsi keempat tahap harus 100%.",
    batalTambahInfo: "Hapus cara bayar yang baru ditambah (paling kanan)",
    batalTambahNama: (n: string) => `↶ Batalkan tambah (${n})`,
    batalTambah: "↶ Batalkan tambah",
    tambahCbInfo: "Tambah kolom cara bayar baru di Data (IRR), Data Harga, Harga dan S&K",
    hapusCbJudul: "Hapus cara bayar ini (konfirmasi di bawah kolom)",
    grupParam: "Parameter cara bayar",
    kelompok: "Kelompok", alokasi: "Alokasi", cicilan: "Cicilan (x)",
    grupBulan: "Bulan pencairan sisa (1 − DP) per tahap",
    grupHasil: "Hasil",
    hargaTunai: "Harga Tunai", selesai: "Selesai", edit: "Ubah",
    kasInfo: "dipakai semua cara bayar · Harga Penyesuaian = Harga Tunai × Koefisien",
    koef: "Koefisien",
    belumTepat: "Belum tepat sesuai target",
    hargaSesuai: "Harga Penyesuaian",
    dariExcel: "Tersimpan dari Excel (hasil Goal Seek)",
    dariTarget: "Dihitung tepat dari target",
    hapusCbInfo: "Hapus cara bayar ini beserta kolomnya di Data Harga dan Harga",
    irrBelum: (n: number, p: string) => `IRR ${n} cara bayar belum tepat ${p}`,
    irrBelumInfo: "Ditandai kuning di baris IRR — biasanya karena Harga Penyesuaian diambil apa adanya dari berkas Excel (hasil Goal Seek). Harga unitnya tetap mengikuti angka itu.",
    samakan: (p: string) => `Samakan ke ${p} (Goal Seek)`,
    totAlok: "Total alokasi",
    waKoef: "Koefisien rata-rata tertimbang",
    alokInfo: "Alokasi otomatis berjumlah 100%: mengubah satu cara bayar menyesuaikan yang lain secara sebanding, dan cara bayar baru langsung mendapat bagian rata. Alokasi hanya untuk Koefisien rata-rata tertimbang, tidak memengaruhi harga.",
    genapkan: "Genapkan ke 100%", bagiRata: "Bagi rata",
    // 2. Data Unit
    pesanKenaikan: (p: string, n: number, terpilih: boolean) =>
      `Kenaikan ${p} diterapkan ke ${n} unit${terpilih ? " terpilih" : ""}. Simpan untuk menyimpannya.`,
    pesanFaktor: (p: string, n: number, terpilih: boolean) =>
      `(+) Faktor ${p} diterapkan ke ${n} unit${terpilih ? " terpilih" : ""}. Simpan untuk menyimpannya.`,
    tidakAdaUnit: "Tidak ada unit di lembar UNIT DATA berkas ini.",
    unitDimuat: (n: number, berkas: string, peringatan?: string) =>
      `${n} unit dimuat dari lembar UNIT DATA ${berkas}. Periksa tabelnya, lalu Simpan.` +
      (peringatan ? ` Perhatikan: ${peringatan}` : ""),
    unitHint: (fungsi: string, excl: boolean, bulat: number, lp: string) =>
      `Harga Dasar = ${fungsi}((Tanah × harga tanah + GFA × harga bangunan)${excl ? " (Belum termasuk PPN)" : " × (1 + PPN)"} × ` +
      `(1 + kenaikan), ${bulat === 6 ? "juta" : (10 ** bulat).toLocaleString("id-ID")}). Harga Setelah Faktor = Harga Dasar × (1 + jumlah faktor posisi) ` +
      `× (1 + (+) Faktor) + Khusus + Unit Contoh × (1 + kenaikan). Harga per m² ditulis sebelum PPN ${lp}; faktor dan kenaikan dalam persen.`,
    tarifPpn: "Tarif PPN",
    ppnInfo: "Ubah bila tarif PPN dari pemerintah berubah. Dipakai untuk kolom Termasuk PPN di sini serta DPP dan Nilai Bebas PPN DTP di langkah 4a.",
    cariUnit: "Cari kode, alamat, arah hadap…",
    ringkasUnit: (n: number) => `${n} unit · total Harga Setelah Faktor`,
    tambahUnit: "+ Tambah unit",
    yakinHapusUnit: (n: number) => `Hapus ${n} unit terpilih?`,
    hapusTerpilih: (n: number) => `− Hapus terpilih (${n})`,
    imporUnit: "Impor Data Unit dari Excel",
    unduhTemplat: "Unduh Templat Data Unit",
    kenaikan: "Kenaikan",
    semuaUnit: (n: number) => `Semua Unit (${n})`,
    unitTerpilih: (n: number) => `Unit Terpilih (${n})`,
    centangDulu: "Centang unit di tabel lebih dulu",
    kenaikanInfo: "Isi persen, lalu terapkan ke semua unit atau ke unit yang dicentang di tabel.",
    faktorPlus: "(+) Faktor",
    faktorInfo: "Mis. Gimmick (Trip, BPHTB, AKAD, Repair) 1%: nilai (+) Faktor unit diganti dengan angka ini.",
    imporHint1: "Berkas Excel dengan lembar",
    imporHint2: "(kolom Code Unit, Address, View, Ukuran, Land, Land Price, GFA, dan seterusnya). Seluruh unit di tabel ini diganti dengan isi berkas; langkah lain tidak berubah. Untuk proyek baru, isi",
    imporHint3: "templat Data Unit",
    imporHint4: "supaya kolomnya pasti terbaca.",
    membaca: "Membaca…", muatUnit: "Muat unit",
    kosongUnit1: "Belum ada unit. Muat dari lembar UNIT DATA dengan",
    kosongUnit2: ", tambahkan satu per satu, atau isi seluruh langkah sekaligus dengan",
    imporSemua: "Impor dari Excel",
    kosongUnit3: "di atas.",
    pilihSemuaUnit: "Pilih semua unit yang tampil",
    pilihBaris: (s: string) => `Pilih ${s}`,
    baris: (n: number) => `baris ${n}`,
    salinInfo: "Tambah unit baru di bawah baris ini dengan isian yang sama",
    salin: "Salin", hapusUnitInfo: "Hapus unit ini",
    teksUnit: {
      kode: "Kode", alamat: "Alamat", view: "Arah Hadap", no: "No", ukuran: "Ukuran", phase: "Tahap",
      tipeBangunan: "Tipe", view2: "Arah Hadap", bentuk: "Sub-Tipe Kavling/Irr/Irr Hoek", subTipe: "Sub-Tipe",
    } as Record<string, string>,
    tanahM2: "Tanah (m²)", hargaTanah: "Harga Tanah (dasar)",
    floor: "Floor (m²)", pembulatan: "(Roundup)", biayaAjb: "Biaya AJB + BPHTB",
    pembagi: "Pembagi Harga Dasar (Termasuk PPN)",
    excl: (lp: string) => `(Belum termasuk PPN ${lp})`,
    incl: (lp: string) => `(Termasuk PPN ${lp})`,
    gfaM2: "GFA (m²)", hargaBangunan: "GFA (dasar)",
    special: "Khusus (Rp)", showUnit: "Unit Contoh (Rp)",
    hargaDasar: "Harga Dasar", hargaFaktor: "Harga Setelah Faktor",
    totalUnit: (n: number, dari?: number) => `Total ${n} unit${dari != null ? ` (dari ${dari})` : ""}`,
    tambahAkhir: "+ Tambah unit di akhir tabel",
    simpanInfo1: "Unit yang ditambah atau dihapus baru tersimpan setelah",
    simpanInfo2: ", dan baru dipakai Simulasi setelah diberlakukan di langkah 4a.",
    // Catatan Data Unit
    maksGambar: (m: number) => `Paling banyak ${m} gambar per catatan.`,
    hanyaSisa: (s: number, m: number) => `Hanya ${s} gambar yang ditambahkan: paling banyak ${m} gambar per catatan.`,
    tempel1: "Tempel tangkapan layar langsung dengan",
    tempel2: "di kotak catatan, atau pilih lewat",
    tempel3: (m: number) => `(paling banyak ${m}). Tulisan dan gambar ikut tersimpan setelah`,
    // Kenaikan bertingkat
    hapusTingkat: (n: number) => `Hapus tingkat ${n}`,
    tambahTingkatInfo: "Tambah tingkat kenaikan (dihitung dari hasil tingkat sebelumnya)",
    tambahTingkat: "+ Tingkat", tambahKenaikan: "+ Kenaikan",
    // 3. Data Harga
    dpHint: "Harga per cara bayar = ROUNDUP(Harga Setelah Faktor × koefisien Data (IRR) × pengali, juta) + tambahan (pengali bawaan 100%, mis. 124% untuk KPR Extra Ultra Express); lalu kenaikan bertingkat khusus cara bayar itu bila diisi — tiap tingkat dari hasil tingkat sebelumnya: ROUNDUP(harga × (1 + %), juta) + Nilai (Rp). Kolom turunan dihitung dari kolom lain di sebelah kirinya: ROUNDUP(kolom itu × pengali, juta), tanpa tambahan.",
    tambahanPerUnit: "Tambahan per unit (Rp)",
    thKolom: "Kolom", thDari: "Dihitung dari", thKoef: "Koefisien / pengali",
    thNaikInfo: "Kenaikan khusus cara bayar ini. Tiap tingkat dihitung dari hasil tingkat sebelumnya: ROUNDUP(harga × (1 + %), juta) + Nilai (Rp)",
    thNaik: "Kenaikan bertingkat", thNaikSub: "% · Nilai (Rp)",
    thMetodeInfo: "Nama kolom yang tampil di Harga dan cetakan; hitungannya tetap dari kolom ini",
    thMetode: "Perubahan Metode Pembayaran",
    optKoef: "Koefisien Data (IRR)", optTurunan: "Turunan kolom",
    tidakDipakai: "tidak dipakai di Harga",
    thMetodeSub: "nama di Harga · pengali · pembulatan",
    tampilkanDiHarga: "+ Tampilkan di Harga",
    hapusDariHarga: "Hapus kolom ini dari Harga (kolom Data Harga tetap)",
    susunanDiLangkah3: "Semua pengaturan harga ada di langkah 3. Data Harga: judul, tanggal berlaku, catatan kolom KPR, dan susunan kolom harga (kolom Perubahan Metode Pembayaran: nama, pengali, pembulatan). Langkah ini menampilkan rincian harganya.",
    geserAtas: "Geser ke atas", geserBawah: "Geser ke bawah",
    geserNamaAtas: (n: string) => `Geser ${n} ke atas`,
    geserNamaBawah: (n: string) => `Geser ${n} ke bawah`,
    hapusDiIrrInfo: "Hapus cara bayarnya di langkah 1 Data (IRR)",
    hapusDiIrr: "hapus di Data (IRR)",
    hapusTurunanInfo: "Hapus cara bayar ini (dan kolom yang dihitung darinya)",
    tambahCbDpInfo: "Cara bayar baru masuk Data (IRR): koefisien dihitung otomatis dari DP, cicilan dan bulan tahap; Alokasi dibagi otomatis",
    tambahCbBesar: "+ Tambah Cara Bayar",
    tambahTurunanInfo: "Kolom yang dihitung dari kolom lain × pengali (mis. BANK KPR = KPR Express × 112%), tidak masuk Data (IRR)",
    tambahTurunan: "+ Tambah kolom turunan",
    cbBaru1: "Cara bayar baru", cbBaru2: "masuk Data (IRR)",
    cbBaru3: ": isi DP, cicilan dan bulan tahapnya di langkah 1 — koefisiennya dihitung otomatis, Alokasi dibagi otomatis (tidak memengaruhi harga), dan kolomnya langsung ada di langkah 4a dan 5.",
    kol: {
      no: "No", kode: "Kode", phase: "Tahap", alamat: "Alamat", view: "Arah Hadap", ukuran: "Ukuran",
      tipe: "Tipe", subTipe: "Sub-Tipe", land: "Tanah", build: "Bangunan",
    },
    // 4a. Harga
    cetakPlInfo: "Pratinjau dan cetak Harga di kertas A4 (atau simpan sebagai PDF)",
    plHint: (lp: string) => "Kolom dengan pengali 100% mengambil harga Data Harga apa adanya; selain itu ROUND(harga × pengali, juta) — di Excel 111,5% untuk kolom KPR — atau ROUNDUP bila dipilih di langkah 3. Data Harga (kolom Perubahan Metode Pembayaran). " +
      `DPP = harga / (1 + PPN ${lp}); Nilai Bebas PPN DTP = harga − DPP. Tarif PPN diubah di langkah 2.`,
    judul: "Judul", tglBerlaku: "Tanggal berlaku", catatanKpr: "Catatan kolom KPR",
    susunan: (n: number) => `Susunan kolom harga (${n})`,
    thKolomPl: "Kolom Harga", thDariDp: "Dari kolom Data Harga", thPengali: "Pengali",
    thBulatInfo: "Pembulatan ke jutaan untuk pengali selain 100%: ROUND (biasa) atau ROUNDUP (ke atas)",
    thBulat: "Pembulatan",
    tidakAda: (n: string) => `${n} (tidak ada)`,
    pengali100: "Pengali 100%: harga diambil apa adanya",
    tambahKolom: "+ Tambah kolom",
    tampilPajak: "Tampilkan DPP & Nilai Bebas PPN DTP",
    ringkasPl: (u: number, c: number) => `${u} unit · ${c} cara bayar`,
    belumUnit: "Belum ada unit di langkah Data Unit.",
    // 5. Syarat dan Ketentuan
    yakinSalin: (nama: string, daftar: string, c: number) => `Syarat dan Ketentuan ${nama}:\n\n${daftar}\n\n${c} catatan.\n\n` +
      "Judul, cara bayar dan catatan di layar diganti dengan isi di atas (rekening proyek ini tetap). Lanjutkan?",
    disalin: (n: string) => `S&K disalin dari ${n}. Periksa nama PT, nominal dan cara bayar yang berbeda, lalu Simpan.`,
    cetakTncInfo: "Pratinjau dan cetak Ketentuan Pembayaran di kertas A4 (atau simpan sebagai PDF)",
    salinDari: "Salin S&K dari proyek", pilih: "— pilih —",
    opsiProyek: (n: string, j: number) => `${n} (${j} cara bayar)`,
    caraBayar: "Cara bayar", hapusBaris: "Hapus baris", catatanOpsional: "Catatan (opsional)",
    tambahBaris: "+ Baris",
    buatSemuaInfo: "Buat blok untuk setiap cara bayar di Harga yang belum ada di sini; blok yang sudah ada tidak diubah",
    buatSemua: "Buat semua cara bayar dari Harga",
    isiWaktuInfo: "Isi kolom waktu yang masih kosong dengan teks awal; yang sudah diisi tidak diubah",
    isiWaktu: "Isi teks awal waktu yang kosong",
    semuaPunyaBlok: "Semua cara bayar di Harga sudah punya blok di sini.",
    belumBlok: (n: number) => `${n} cara bayar di Harga belum punya blok.`,
    awalInfo: "Angka dan waktunya diisi dari Data (IRR) sebagai awal — periksa dan lengkapi.",
    tambahCatatan: "+ Tambah catatan",
    rekening: "Rekening pembayaran", thBank: "Bank", thNoRek: "No. Rekening", thCabang: "Cabang",
    tambahRek: "+ Tambah rekening",
    // Lampiran gambar S&K
    maksLampiran: (m: number) => `Paling banyak ${m} gambar.`,
    lampiranJudul: "Lampiran gambar",
    lamp1: "Dicetak di halaman terakhir Ketentuan Pembayaran,",
    lamp2: "berlaku untuk semua proyek",
    lamp3: ", dan langsung tersimpan (tidak perlu Simpan draf).",
    geserDepan: "Geser ke depan", geserBelakang: "Geser ke belakang",
    tempelPh: "Klik di sini lalu Ctrl + V untuk menempel tangkapan layar",
  },
  en: {
    yaHapus: "Yes, delete", batal: "Cancel", hapus: "Delete", simpan: "Save",
    hapusNama: (n: string) => `Delete ${n}`,
    tambahCb: "+ Add payment scheme",
    mengunggah: "Uploading…", tambahGambar: "+ Add image",
    bukaGambar: "Open full-size image",
    cetakA4: "🖨 Print A4",
    catatan: "Notes",
    irrHint: "Each payment scheme's coefficient is the price at which the IRR of its cash flow equals the target interest rate, divided by the Cash Keras price. The DP is paid in equal instalments in months 1 to n; the remainder (1 − DP) is disbursed in the month of each construction stage.",
    target: "Target interest rate (per year)",
    porsi: (t: string) => `Share ${t}`,
    porsi100: "The shares of the four stages must total 100%.",
    batalTambahInfo: "Remove the payment scheme just added (rightmost)",
    batalTambahNama: (n: string) => `↶ Undo add (${n})`,
    batalTambah: "↶ Undo add",
    tambahCbInfo: "Add a new payment scheme column to Data (IRR), Price Data, Price List and T&C",
    hapusCbJudul: "Delete this payment scheme (confirm below the column)",
    grupParam: "Payment scheme parameters",
    kelompok: "Group", alokasi: "Allocation", cicilan: "Installments (x)",
    grupBulan: "Disbursement month of the remainder (1 − DP) per stage",
    grupHasil: "Results",
    hargaTunai: "Cash Price", selesai: "Done", edit: "Edit",
    kasInfo: "used by every payment scheme · Adjusted Price = Cash Price × Coefficient",
    koef: "Coefficient",
    belumTepat: "Not exactly on target",
    hargaSesuai: "Adjusted Price",
    dariExcel: "Stored from Excel (Goal Seek result)",
    dariTarget: "Calculated exactly from the target",
    hapusCbInfo: "Delete this payment scheme and its columns in Price Data and Price List",
    irrBelum: (n: number, p: string) => `IRR of ${n} payment schemes not exactly ${p}`,
    irrBelumInfo: "Marked yellow in the IRR row — usually because the Adjusted Price was taken as-is from the Excel file (Goal Seek result). Unit prices still follow that figure.",
    samakan: (p: string) => `Match to ${p} (Goal Seek)`,
    totAlok: "Total allocation",
    waKoef: "WA coefficient",
    alokInfo: "Allocation always totals 100%: changing one payment scheme adjusts the others proportionally, and a new payment scheme immediately gets an equal share. Allocation only feeds the WA Coefficient and does not affect prices.",
    genapkan: "Normalize to 100%", bagiRata: "Split evenly",
    pesanKenaikan: (p: string, n: number, terpilih: boolean) =>
      `Increase ${p} applied to ${n}${terpilih ? " selected" : ""} units. Save to keep it.`,
    pesanFaktor: (p: string, n: number, terpilih: boolean) =>
      `(+) Factor ${p} applied to ${n}${terpilih ? " selected" : ""} units. Save to keep it.`,
    tidakAdaUnit: "No units in this file's UNIT DATA sheet.",
    unitDimuat: (n: number, berkas: string, peringatan?: string) =>
      `${n} units loaded from the UNIT DATA sheet of ${berkas}. Review the table, then Save.` +
      (peringatan ? ` Note: ${peringatan}` : ""),
    unitHint: (fungsi: string, excl: boolean, bulat: number, lp: string) =>
      `Base Price = ${fungsi}((Land × land price + GFA × building price)${excl ? " (Excl VAT)" : " × (1 + VAT)"} × ` +
      `(1 + increase), ${bulat === 6 ? "million" : (10 ** bulat).toLocaleString("id-ID")}). Factored Price = Base × (1 + sum of position factors) ` +
      `× (1 + (+) Factor) + Special + Show Unit × (1 + increase). Prices per m² are entered before VAT ${lp}; factors and increases are in percent.`,
    tarifPpn: "VAT rate",
    ppnInfo: "Change it when the government VAT rate changes. Used for the Incl PPN columns here and for DPP and the free VAT (DTP) amount in step 4a.",
    cariUnit: "Search code, address, view…",
    ringkasUnit: (n: number) => `${n} units · total Factored Price`,
    tambahUnit: "+ Add unit",
    yakinHapusUnit: (n: number) => `Delete ${n} selected units?`,
    hapusTerpilih: (n: number) => `− Delete selected (${n})`,
    imporUnit: "Import Unit Data from Excel",
    unduhTemplat: "Download Unit Data Template",
    kenaikan: "Increase",
    semuaUnit: (n: number) => `All Units (${n})`,
    unitTerpilih: (n: number) => `Selected Units (${n})`,
    centangDulu: "Tick units in the table first",
    kenaikanInfo: "Enter a percentage, then apply it to all units or to the units ticked in the table.",
    faktorPlus: "(+) Factor",
    faktorInfo: "E.g. Gimmick (Trip, BPHTB, AKAD, Repair) 1%: each unit's (+) Factor is replaced with this figure.",
    imporHint1: "An Excel file with the sheet",
    imporHint2: "(columns Code Unit, Address, View, Ukuran, Land, Land Price, GFA, and so on). Every unit in this table is replaced with the file's content; other steps are unchanged. For a new project, fill in the",
    imporHint3: "Unit Data template",
    imporHint4: "so its columns are sure to be read.",
    membaca: "Reading…", muatUnit: "Load units",
    kosongUnit1: "No units yet. Load them from the UNIT DATA sheet with",
    kosongUnit2: ", add them one by one, or fill every step at once with",
    imporSemua: "Import from Excel",
    kosongUnit3: "above.",
    pilihSemuaUnit: "Select all units shown",
    pilihBaris: (s: string) => `Select ${s}`,
    baris: (n: number) => `row ${n}`,
    salinInfo: "Add a new unit below this row with the same values",
    salin: "Copy", hapusUnitInfo: "Delete this unit",
    teksUnit: {
      kode: "Code", alamat: "Address", view: "View", no: "No", ukuran: "Size", phase: "Phase",
      tipeBangunan: "Type", view2: "View", bentuk: "Sub-type Kavling/Irr/Irr Hoek", subTipe: "Sub-type",
    } as Record<string, string>,
    tanahM2: "Land (m²)", hargaTanah: "Land Price (base)",
    floor: "Floor (m²)", pembulatan: "(Roundup)", biayaAjb: "AJB + BPHTB Fee",
    pembagi: "Base Price Divisor (Incl. VAT)",
    excl: (lp: string) => `(Excl PPN. ${lp})`,
    incl: (lp: string) => `(Incl PPN. ${lp})`,
    gfaM2: "GFA (m²)", hargaBangunan: "GFA (base)",
    special: "Special (Rp)", showUnit: "Show Unit (Rp)",
    hargaDasar: "Base Price", hargaFaktor: "Factored Price",
    totalUnit: (n: number, dari?: number) => `Total ${n} units${dari != null ? ` (of ${dari})` : ""}`,
    tambahAkhir: "+ Add unit at the end of the table",
    simpanInfo1: "Units added or deleted are only stored after",
    simpanInfo2: ", and are only used by Simulation once applied in step 4a.",
    maksGambar: (m: number) => `At most ${m} images per note.`,
    hanyaSisa: (s: number, m: number) => `Only ${s} images were added: at most ${m} images per note.`,
    tempel1: "Paste a screenshot directly with",
    tempel2: "in the notes box, or choose one with",
    tempel3: (m: number) => `(at most ${m}). Text and images are stored after`,
    hapusTingkat: (n: number) => `Remove tier ${n}`,
    tambahTingkatInfo: "Add an increase tier (calculated from the previous tier's result)",
    tambahTingkat: "+ Tier", tambahKenaikan: "+ Increase",
    dpHint: "Price per payment scheme = ROUNDUP(Factored Price × Data (IRR) coefficient × multiplier, million) + addition (multiplier defaults to 100%, e.g. 124% for KPR Extra Ultra Express); then that scheme's own tiered increase if filled in — each tier from the previous tier's result: ROUNDUP(price × (1 + %), million) + Amount (Rp). Derived columns are calculated from another column to their left: ROUNDUP(that column × multiplier, million), with no addition.",
    tambahanPerUnit: "Addition per unit (Rp)",
    thKolom: "Column", thDari: "Calculated from", thKoef: "Coefficient / multiplier",
    thNaikInfo: "Increase specific to this payment scheme. Each tier is calculated from the previous tier's result: ROUNDUP(price × (1 + %), million) + Amount (Rp)",
    thNaik: "Tiered increase", thNaikSub: "% · Amount (Rp)",
    thMetodeInfo: "Column name shown in the Price List and printouts; the calculation still comes from this column",
    thMetode: "Payment Method Name",
    optKoef: "Data (IRR) coefficient", optTurunan: "Derived from column",
    tidakDipakai: "not used in the Price List",
    thMetodeSub: "name in Price List · multiplier · rounding",
    tampilkanDiHarga: "+ Show in Price List",
    hapusDariHarga: "Remove this column from the Price List (the Price Data column stays)",
    susunanDiLangkah3: "All price settings are in step 3. Price Data: title, effective date, KPR column note, and the price column layout (Payment Method Name column: name, multiplier, rounding). This step shows the price details.",
    geserAtas: "Move up", geserBawah: "Move down",
    geserNamaAtas: (n: string) => `Move ${n} up`,
    geserNamaBawah: (n: string) => `Move ${n} down`,
    hapusDiIrrInfo: "Delete its payment scheme in step 1 Data (IRR)",
    hapusDiIrr: "delete in Data (IRR)",
    hapusTurunanInfo: "Delete this payment scheme (and the columns calculated from it)",
    tambahCbDpInfo: "A new payment scheme goes into Data (IRR): its coefficient is calculated automatically from the DP, installments and stage months; Allocation is split automatically",
    tambahCbBesar: "+ Add Payment Scheme",
    tambahTurunanInfo: "A column calculated from another column × multiplier (e.g. BANK KPR = KPR Express × 112%); not added to Data (IRR)",
    tambahTurunan: "+ Add derived column",
    cbBaru1: "A new payment scheme", cbBaru2: "goes into Data (IRR)",
    cbBaru3: ": fill in its DP, installments and stage months in step 1 — its coefficient is calculated automatically, Allocation is split automatically (it does not affect prices), and its column appears right away in steps 4a and 5.",
    kol: {
      no: "No", kode: "Code", phase: "Phase", alamat: "Address", view: "View", ukuran: "Size",
      tipe: "Type", subTipe: "Sub-type", land: "Land", build: "Build",
    },
    cetakPlInfo: "Preview and print the Price List on A4 paper (or save as PDF)",
    plHint: (lp: string) => "Columns with a 100% multiplier take the Price Data price as-is; otherwise ROUND(price × multiplier, million) — 111.5% for the KPR columns in Excel — or ROUNDUP if chosen in step 3. Price Data (Payment Method Name column). " +
      `DPP = price / (1 + VAT ${lp}); free VAT (DTP) amount = price − DPP. The VAT rate is changed in step 2.`,
    judul: "Title", tglBerlaku: "Effective date", catatanKpr: "KPR column note",
    susunan: (n: number) => `Price column layout (${n})`,
    thKolomPl: "Price List column", thDariDp: "From Price Data column", thPengali: "Multiplier",
    thBulatInfo: "Rounding to millions for multipliers other than 100%: ROUND (normal) or ROUNDUP (up)",
    thBulat: "Rounding",
    tidakAda: (n: string) => `${n} (missing)`,
    pengali100: "100% multiplier: the price is taken as-is",
    tambahKolom: "+ Add column",
    tampilPajak: "Show DPP & free VAT (DTP)",
    ringkasPl: (u: number, c: number) => `${u} units · ${c} payment schemes`,
    belumUnit: "No units in the Unit Data step yet.",
    yakinSalin: (nama: string, daftar: string, c: number) => `Terms & Conditions ${nama}:\n\n${daftar}\n\n${c} notes.\n\n` +
      "The title, payment schemes and notes on screen will be replaced with the content above (this project's bank accounts stay). Continue?",
    disalin: (n: string) => `T&C copied from ${n}. Check the company name, amounts and any payment schemes that differ, then Save.`,
    cetakTncInfo: "Preview and print the Term of Payment on A4 paper (or save as PDF)",
    salinDari: "Copy T&C from project", pilih: "— choose —",
    opsiProyek: (n: string, j: number) => `${n} (${j} payment schemes)`,
    caraBayar: "Payment schemes", hapusBaris: "Delete row", catatanOpsional: "Note (optional)",
    tambahBaris: "+ Row",
    buatSemuaInfo: "Create a block for every payment scheme in the Price List that is not here yet; existing blocks are not changed",
    buatSemua: "Create all payment schemes from the Price List",
    isiWaktuInfo: "Fill empty timing fields with starter text; filled ones are not changed",
    isiWaktu: "Fill empty timing with starter text",
    semuaPunyaBlok: "Every payment scheme in the Price List already has a block here.",
    belumBlok: (n: number) => `${n} payment schemes in the Price List have no block yet.`,
    awalInfo: "Amounts and timing are filled from Data (IRR) as a starting point — check and complete them.",
    tambahCatatan: "+ Add note",
    rekening: "Payment accounts", thBank: "Bank", thNoRek: "Account No.", thCabang: "Branch",
    tambahRek: "+ Add account",
    maksLampiran: (m: number) => `At most ${m} images.`,
    lampiranJudul: "Attachment images",
    lamp1: "Printed on the last page of the Term of Payment,",
    lamp2: "applies to every project",
    lamp3: ", and saved immediately (no need to Save the draft).",
    geserDepan: "Move forward", geserBelakang: "Move back",
    tempelPh: "Click here, then Ctrl + V to paste a screenshot",
  },
};

export type PropsLangkah = {
  data: SusunPricelist;
  hasil: HasilSusun;
  ubah: (f: (d: SusunPricelist) => SusunPricelist) => void;
  bolehUbah: boolean;
};

// ── Kotak angka ────────────────────────────────────────────────────────────

type Jenis = "rp" | "persen" | "angka";

const tampilAngka = (n: number, jenis: Jenis) => {
  if (!Number.isFinite(n)) return "";
  const v = jenis === "persen" ? +(n * 100).toFixed(6) : n;
  return v.toLocaleString("id-ID", { maximumFractionDigits: jenis === "rp" ? 0 : 6 });
};

/** "1.817.000.000" / "9,5" / "146.5" → angka; null bila bukan angka. */
function bacaAngka(s: string, jenis: Jenis): number | null {
  let t = s.trim().replace(/^rp\.?/i, "").replace(/%$/, "").replace(/\s/g, "");
  if (!t) return 0;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return jenis === "persen" ? n / 100 : n;
}

/**
 * Kotak isian angka. Selama diketik, isinya teks apa adanya; angkanya baru
 * dibaca saat kotak ditinggalkan atau Enter ditekan — supaya "9," yang baru
 * setengah diketik tidak langsung dibulatkan menjadi 9.
 */
/**
 * Lebar kotak isian: sekurang-kurangnya `lebar`, dan melebar mengikuti isinya
 * bila isinya lebih panjang — supaya isian tidak terpotong dan kolom tabelnya
 * ikut melebar dengan sendirinya.
 */
const lebarIsi = (teks: string, lebar: number) =>
  `max(${lebar}px, calc(${teks.length + 1}ch + 14px))`;

export function Isian({ nilai, ubah, jenis = "angka", lebar = 90, disabled, id, kosongNol, desimal }: {
  nilai: number; ubah: (n: number) => void; jenis?: Jenis; lebar?: number;
  disabled?: boolean; id?: string;
  /** Tampilkan 0 sebagai kotak kosong (kolom yang biasanya tidak diisi). */
  kosongNol?: boolean;
  /**
   * Jumlah angka di belakang koma saat kotak tidak sedang disunting. Hanya
   * tampilan: nilainya tetap utuh, dan saat kotak diklik angka lengkapnya
   * muncul untuk disunting.
   */
  desimal?: number;
}) {
  const [teks, setTeks] = useState<string | null>(null);
  const [salah, setSalah] = useState(false);
  const simpan = () => {
    if (teks == null) return;
    const n = bacaAngka(teks, jenis);
    if (n == null) { setSalah(true); return; }
    setSalah(false); setTeks(null);
    if (n !== nilai) ubah(n);
  };
  const tampil = teks ?? (kosongNol && nilai === 0 ? ""
    : desimal != null && Number.isFinite(nilai)
      ? (jenis === "persen" ? nilai * 100 : nilai)
          .toLocaleString("id-ID", { minimumFractionDigits: desimal, maximumFractionDigits: desimal })
      : tampilAngka(nilai, jenis));
  return (
    <span className="isian-angka">
      <input id={id} value={tampil}
             disabled={disabled}
             onFocus={desimal != null ? () => setTeks(tampilAngka(nilai, jenis)) : undefined}
             inputMode="decimal" aria-invalid={salah || undefined}
             style={{ width: lebarIsi(tampil, lebar) }}
             onChange={(e) => setTeks(e.target.value)} onBlur={simpan}
             onKeyDown={(e) => { if (e.key === "Enter") simpan(); }} />
      <span className="satuan">{jenis === "persen" && !(kosongNol && nilai === 0 && teks == null) ? "%" : ""}</span>
    </span>
  );
}

/**
 * Kotak nama cara bayar / kolom yang dirujuk kolom lain. Namanya baru
 * diganti saat kotak ditinggalkan atau Enter ditekan — bukan tiap ketikan —
 * dan ditolak bila kosong atau sama dengan nama lain. Mengganti per ketikan
 * dapat melewati nama yang sama dengan kolom lain (mis. saat isinya
 * dihapus), sehingga rujukan kedua kolom tergabung dan tidak dapat dipisah
 * lagi (kolom Harga merujuk kolom yang salah).
 */
function IsianNama({ nilai, ubah, lain, lebar = 110, disabled, id }: {
  nilai: string; ubah: (s: string) => void; lain: string[]; lebar?: number; disabled?: boolean; id?: string;
}) {
  const [teks, setTeks] = useState<string | null>(null);
  const t = (teks ?? nilai).trim();
  const salah = teks != null && (!t || lain.includes(t));
  const simpan = () => {
    if (teks == null) return;
    if (!salah && t !== nilai) ubah(t);
    setTeks(null);
  };
  return <input id={id} value={teks ?? nilai} disabled={disabled} aria-invalid={salah || undefined}
                title={salah ? (t ? "Nama ini sudah dipakai" : "Nama tidak boleh kosong") : undefined}
                style={{ width: lebarIsi(teks ?? nilai, lebar) }}
                onChange={(e) => setTeks(e.target.value)} onBlur={simpan}
                onKeyDown={(e) => { if (e.key === "Enter") simpan(); if (e.key === "Escape") setTeks(null); }} />;
}

function IsianTeks({ nilai, ubah, lebar = 110, disabled, id }: {
  nilai: string; ubah: (s: string) => void; lebar?: number; disabled?: boolean; id?: string;
}) {
  return <input id={id} value={nilai} disabled={disabled}
                style={{ width: lebarIsi(nilai, lebar) }}
                onChange={(e) => ubah(e.target.value)} />;
}

const rp = (n: number) => (Number.isFinite(n) ? formatRupiah(n) : "—");
/** Harga per m² tanpa "Rp", sejajar dengan kotak isian harga di sebelahnya. */
const rpPolos = (n?: number) =>
  n != null && Number.isFinite(n) ? Math.round(n).toLocaleString("id-ID") : "—";
const luas = (n: number, d?: number) =>
  `${n.toLocaleString("id-ID", d == null ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: d, maximumFractionDigits: d })} m²`;
const persen = (n: number, d = 2, min = 0) =>
  Number.isFinite(n)
    ? `${(n * 100).toLocaleString("id-ID", { minimumFractionDigits: min, maximumFractionDigits: d })}%`
    : "—";

// ── 1. Data (IRR) ──────────────────────────────────────────────────────────

/**
 * Bagi `total` basis poin (10000 = 100%) sebanding dengan `bobot`, dengan
 * metode sisa terbesar supaya jumlahnya tepat `total`. Bobot nol semua →
 * dibagi rata.
 */
function bagiSebanding(bobot: number[], total: number): number[] {
  if (!bobot.length) return [];
  const jml = bobot.reduce((a, b) => a + Math.max(0, b), 0);
  const dasar = jml > 0 ? bobot.map((b) => (Math.max(0, b) / jml) * total) : bobot.map(() => total / bobot.length);
  const bulat = dasar.map(Math.floor);
  let sisa = total - bulat.reduce((a, b) => a + b, 0);
  dasar.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (sisa > 0) { bulat[i]++; sisa--; } });
  return bulat;
}

/**
 * Allocation selalu berjumlah 100%: cara bayar ke-`i` diberi `nilai`, sisanya
 * dibagi ke cara bayar lain sebanding dengan allocation lamanya.
 */
function aturAlokasi<T extends { alokasi: number }>(skema: T[], i: number, nilai: number): T[] {
  const bp = Math.round(Math.min(1, Math.max(0, nilai)) * 10000);
  const lain = skema.map((s, j) => ({ s, j })).filter(({ j }) => j !== i);
  const bagian = bagiSebanding(lain.map(({ s }) => s.alokasi), 10000 - bp);
  const baru = skema.map((s) => ({ ...s }));
  baru[i].alokasi = bp / 10000;
  lain.forEach(({ j }, k) => { baru[j].alokasi = bagian[k] / 10000; });
  return baru;
}

/**
 * Allocation otomatis untuk cara bayar yang baru ditambah di ujung: ia
 * mendapat bagian rata (100% / jumlah cara bayar), dan
 * cara bayar lain menyesuaikan sebanding — total tetap 100%. Allocation hanya
 * dipakai untuk WA Coefficient, tidak memengaruhi harga.
 */
function denganAlokasiBaru<T extends { alokasi: number }>(skema: T[]): T[] {
  return skema.length ? aturAlokasi(skema, skema.length - 1, 1 / skema.length) : skema;
}

/** Sesuaikan semua allocation sebanding supaya berjumlah 100%. */
function genapkanAlokasi<T extends { alokasi: number }>(skema: T[]): T[] {
  const bagian = bagiSebanding(skema.map((s) => s.alokasi), 10000);
  return skema.map((s, j) => ({ ...s, alokasi: bagian[j] / 10000 }));
}


/**
 * Draf dengan satu cara bayar baru di ujung kanan: kolom di Data (IRR) (DP,
 * cicilan dan bulan tahap disalin dari cara bayar pertama, diubah di sana),
 * kolom Data Pricelist berkoefisien IRR-nya sendiri, kolom Pricelist, dan
 * satu blok T&C — supaya tidak ada langkah yang tertinggal. Dipakai tombol
 * + Tambah Cara Bayar di langkah 1 dan langkah 3.
 */
function denganCaraBayarBaru(d: SusunPricelist): SusunPricelist {
  const ada = new Set([...d.irr.skema.map((x) => x.nama), ...d.dataPricelist.kolom.map((k) => k.nama)]);
  let no = d.irr.skema.length + 1;
  while (ada.has(`Cara bayar ${no}`)) no++;
  const nama = `Cara bayar ${no}`;
  return {
    ...d,
    irr: { ...d.irr, skema: denganAlokasiBaru([...d.irr.skema, {
      nama, kelompok: "Cash", alokasi: 0, dp: 1, kali: 1, otomatis: true,
      bulan: [...(d.irr.skema[0]?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number],
    }]) },
    dataPricelist: { ...d.dataPricelist, kolom: [...d.dataPricelist.kolom, { nama, skema: nama }] },
    pricelist: { ...d.pricelist, kolom: [...d.pricelist.kolom, { nama, dari: nama, kali: 1 }] },
    tnc: { ...d.tnc, caraBayar: [...d.tnc.caraBayar, { judul: nama.toUpperCase(),
      baris: [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }] }] },
  };
}

/**
 * Draf lama: cara bayar yang dulu ditambah tanpa Allocation (Allocation 0%
 * atau tanda "tambahan" di Data (IRR), atau kolom "Cara bayar baru N" di Data Pricelist
 * yang dulu tidak masuk Data (IRR)) kini mendapat Allocation otomatis seperti
 * cara bayar baru; parameternya diisi dari namanya.
 */
export function rapikanCaraBayar(d: SusunPricelist): SusunPricelist {
  // Hanya yang pengalinya masih 100% (harganya sama dengan cara bayar asal).
  const pindah = d.dataPricelist.kolom.filter((k) => k.dari && (k.kali ?? 1) === 1
    && /^cara bayar baru \d+$/i.test(k.nama)
    && !d.irr.skema.some((x) => x.nama === k.nama));
  const nol = (x: SusunPricelist["irr"]["skema"][0]) =>
    x.tambahan || (!x.acuan && !x.alokasi && d.irr.skema.some((y) => y.alokasi > 0));
  if (!pindah.length && !d.irr.skema.some(nol)) return d;
  let skema = d.irr.skema.map((x) => (nol(x) ? { ...x, tambahan: undefined, alokasi: 0, baru: true }
                                                  : { ...x, baru: false }));
  const dasar = skema.filter((x) => !x.baru);
  skema = [...dasar, ...skema.filter((x) => x.baru)];
  const urut = skema.map((x) => x.nama);
  for (const k of pindah) {
    skema.push({ nama: k.nama, kelompok: "Cash", alokasi: 0, dp: 1, kali: 1, otomatis: true, baru: true,
                 bulan: [...(d.irr.skema[0]?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number] });
  }
  // Bagian rata untuk tiap cara bayar baru, satu per satu, seperti saat ditambah.
  let hasil = skema.slice(0, dasar.length);
  for (const x of skema.slice(dasar.length)) hasil = denganAlokasiBaru([...hasil, x]);
  // Urutan kolom Data (IRR) semula dipertahankan; yang dipindah di ujung.
  const posisi = (n: string) => { const j = urut.indexOf(n); return j < 0 ? urut.length : j; };
  hasil.sort((a, b) => posisi(a.nama) - posisi(b.nama));
  const namaPindah = new Set(pindah.map((k) => k.nama));
  return isiOtomatisCaraBayar({
    ...d,
    irr: { ...d.irr, skema: hasil.map(({ baru: _, ...x }) => x) },
    dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((k) => {
      if (!namaPindah.has(k.nama)) return k;
      const { dari: _d, kali: _k, ...sisa } = k;
      return { ...sisa, skema: k.nama };
    }) },
  });
}

/**
 * Parameter cara bayar dibaca dari namanya: "KPR …" / "BANK …" / "DP x%" →
 * kelompok KPR; "DP x%" → DP; "Nx" → Installments; tanpa DP: Cash 100%,
 * KPR 10%. Bulan tahap disalin dari cara bayar lama yang paling mirip
 * (kelompok sama, Express atau bukan, DP terdekat).
 */
function parameterDariNama(nama: string, skema: SusunPricelist["irr"]["skema"]) {
  const t = nama.toUpperCase();
  const dpCocok = /DP\s*(\d+(?:[.,]\d+)?)\s*%/.exec(t);
  const dp = dpCocok ? Number(dpCocok[1].replace(",", ".")) / 100 : null;
  const kpr = /\b(KPR|BANK|KREDIT)\b/.test(t) || (dp != null && dp < 1);
  const kali = Number(/(\d+)\s*X\b/.exec(t)?.[1]) || 1;
  const express = /EXPRESS/.test(t);
  const kelompok = kpr ? "KPR" : "Cash";
  const dpAkhir = dp ?? (kpr ? 0.1 : 1);
  const calon = skema.filter((x) => !x.otomatis && x.kelompok === kelompok);
  const mirip = [...calon].sort((a, b) =>
    (Number(/EXPRESS/i.test(a.nama) !== express) - Number(/EXPRESS/i.test(b.nama) !== express))
    || Math.abs(a.dp - dpAkhir) - Math.abs(b.dp - dpAkhir))[0] ?? skema.find((x) => !x.otomatis);
  return { kelompok, dp: dpAkhir, kali,
           bulan: [...(mirip?.bulan ?? [12, 18, 19, 20])] as [number, number, number, number] };
}

/**
 * Isi otomatis parameter cara bayar baru dari namanya, sesudah setiap
 * perubahan draf. Nama diambil dari kolom Data Pricelist-nya bila nama di
 * Data (IRR) masih nama bawaan ("Cara bayar N").
 */
export function isiOtomatisCaraBayar(d: SusunPricelist): SusunPricelist {
  if (!d.irr.skema.some((x) => x.otomatis)) return d;
  let ubah = false;
  const skema = d.irr.skema.map((x) => {
    if (!x.otomatis) return x;
    const namaDp = d.dataPricelist.kolom.find((k) => k.skema === x.nama)?.nama;
    const nama = /^cara bayar \d+$/i.test(x.nama) && namaDp ? namaDp : x.nama;
    const p = parameterDariNama(nama, d.irr.skema);
    if (x.kelompok === p.kelompok && x.dp === p.dp && x.kali === p.kali
        && x.bulan.every((b, j) => b === p.bulan[j])) return x;
    ubah = true;
    return { ...x, ...p };
  });
  return ubah ? { ...d, irr: { ...d.irr, skema } } : d;
}

export function LangkahIrr({ data, hasil, ubah, bolehUbah, baru }: PropsLangkah & {
  /**
   * Jumlah cara bayar yang baru ditambah di ujung kanan, disimpan halamannya
   * supaya tetap ada walau berpindah langkah (untuk "Batalkan tambah").
   */
  baru?: [number, (f: (n: number) => number) => void];
}) {
  const kt = useKata(KATA);
  const irr = data.irr;
  const TAHAP = namaTahap(irr);
  // Cash Price diubah lewat tombol Edit, supaya tidak tergeser tanpa sengaja.
  const [editKas, setEditKas] = useState(false);
  const ro = !bolehUbah;
  // Mengubah arus kas cara bayar (DP, cicilan, bulan, Cash Price) membuat
  // Adjusted Price tersimpan tidak berlaku lagi — seperti di Excel yang
  // harus di-Goal Seek ulang; di sini langsung dihitung ulang tepat.
  const ubahArus = (i: number, f: (s: SusunPricelist["irr"]["skema"][0]) => typeof s) =>
    ubahSkema(i, (x) => ({ ...f(x), hargaSesuai: undefined }));
  const tanpaSimpanan = (d: SusunPricelist) =>
    d.irr.skema.map((x) => ({ ...x, hargaSesuai: undefined }));
  // Cara bayar yang IRR-nya belum tepat pada target (mis. Adjusted Price
  // hasil Goal Seek dari berkas Excel lama). Tombol Goal Seek hanya muncul
  // bila ada; bila semuanya sudah sesuai rumus, tidak ada yang perlu disamakan.
  const belumSesuai = new Set(irr.skema.filter((s) => !s.acuan
    && Number.isFinite(hasil.irr.irr[s.nama])
    && Math.abs(hasil.irr.irr[s.nama] - irr.target) > 1e-7).map((s) => s.nama));
  // Mengubah parameter cara bayar secara manual menghentikan pengisian otomatis.
  const ubahSkema = (i: number, f: (s: SusunPricelist["irr"]["skema"][0]) => typeof s) =>
    ubah((d) => ({ ...d, irr: { ...d.irr, skema: d.irr.skema.map((s, j) =>
      j === i ? { ...f(s), otomatis: undefined } : s) } }));
  const ganti = (i: number, nama: string) => ubah((d) => {
    const lama = d.irr.skema[i].nama;
    // Kolom Data Pricelist yang merujuk cara bayar ini ikut berganti; bila
    // namanya sama dengan nama cara bayarnya (kolom yang dibuat bersama
    // cara bayar itu), namanya juga berganti, begitu pula rujukan kolom
    // Pricelist dan kolom turunan kepadanya.
    const ubahNamaDp = new Set(d.dataPricelist.kolom
      .filter((k) => k.skema === lama && k.nama === lama).map((k) => k.nama));
    const n = (x: string) => (ubahNamaDp.has(x) ? nama : x);
    return {
      ...d,
      irr: { ...d.irr, skema: d.irr.skema.map((s, j) => j === i ? { ...s, nama } : s) },
      dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((k) => ({
        ...k, nama: n(k.nama),
        ...(k.skema === lama && { skema: nama }),
        ...(k.dari && { dari: n(k.dari) }),
      })) },
      pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.map((k) => ({
        ...k, dari: n(k.dari), nama: k.nama === lama && ubahNamaDp.has(lama) ? nama : k.nama,
      })) },
    };
  });

  /**
   * Cara bayar baru: kolom di Data (IRR), dan kolomnya langsung ikut di Data
   * Pricelist (Factored Price × koefisien + tambahan), di Pricelist (pengali
   * 100%), dan satu blok ketentuan di T&C — supaya tidak ada langkah yang
   * tertinggal. Isiannya dapat diubah sesudahnya.
   */
  const [yakinHapus, setYakinHapus] = useState<number | null>(null);
  /** Jumlah cara bayar yang baru ditambah di ujung kanan (untuk "Batalkan tambah"). */
  const [baruLokal, setBaruLokal] = useState(0);
  const [baruDitambah, setBaruDitambah] = baru ?? [baruLokal, setBaruLokal];
  const tambahSkema = () => { setBaruDitambah((n) => n + 1); tambahSkemaData(); };
  const batalTambah = () => {
    if (!baruDitambah || irr.skema.length <= 1) return;
    setBaruDitambah((n) => n - 1);
    hapusSkema(irr.skema.length - 1);
  };
  const tambahSkemaData = () => ubah(denganCaraBayarBaru);
  /** Hapus cara bayar beserta kolom Data Pricelist dan Pricelist yang bersumber darinya. */
  const hapusSkema = (i: number) => {
    setYakinHapus(null);
    ubah((d) => {
      const nama = d.irr.skema[i].nama;
      const hilang = new Set(d.dataPricelist.kolom.filter((k) => k.skema === nama).map((k) => k.nama));
      // Kolom turunan dari kolom yang hilang ikut hilang.
      d.dataPricelist.kolom.forEach((k) => { if (k.dari && hilang.has(k.dari)) hilang.add(k.nama); });
      return {
        ...d,
        // Allocation cara bayar yang dihapus dibagi ke yang lain (tetap 100%).
        irr: { ...d.irr, skema: genapkanAlokasi(d.irr.skema.filter((_, j) => j !== i)) },
        dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.filter((k) => !hilang.has(k.nama)) },
        pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.filter((k) => !hilang.has(k.dari)) },
      };
    });
  };

  return (
    <>
      <p className="hint kiri">{kt.irrHint}</p>
      <div className="filters rapat param-irr">
        <div>
          <div className="lbl">{kt.target}</div>
          <Isian id="irr-target" jenis="persen" nilai={irr.target} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr, target: n, skema: tanpaSimpanan(d) } }))} />
        </div>
      </div>
      <div className="filters rapat param-irr">
        {TAHAP.map((t, i) => (
          <div key={t}>
            <div className="lbl">{kt.porsi(t)}</div>
            <Isian id={`irr-porsi-${i}`} jenis="persen" nilai={irr.porsiTahap[i]} disabled={ro}
                   ubah={(n) => ubah((d) => {
                     const p = [...d.irr.porsiTahap] as typeof irr.porsiTahap; p[i] = n;
                     return { ...d, irr: { ...d.irr, porsiTahap: p, skema: tanpaSimpanan(d) } };
                   })} />
          </div>
        ))}
      </div>
      {Math.abs(irr.porsiTahap.reduce((a, b) => a + b, 0) - 1) > 1e-9 && (
        <div className="banner warn">{kt.porsi100}</div>
      )}

      {bolehUbah && (
        <div className="row" style={{ justifyContent: "flex-end", margin: "12px 0 6px" }}>
          {baruDitambah > 0 && irr.skema.length > 1 && (
            <button onClick={batalTambah}
                    title={kt.batalTambahInfo}>
              {kt.batalTambahNama(irr.skema[irr.skema.length - 1].nama)}</button>
          )}
          <button className="pri" onClick={tambahSkema}
                  title={kt.tambahCbInfo}>
            {kt.tambahCb}</button>
        </div>
      )}
      {/* Grid tetap: setiap cara bayar selebar sama, kotak isian memenuhi
          kolomnya, tanda % sejajar, dan baris dikelompokkan. */}
      <div className="tscroll">
        <table className="tabel-ringkas tabel-isian tabel-irr">
          <colgroup>
            <col className="k-label" />
            {irr.skema.map((_, i) => <col key={i} className="k-skema" />)}
          </colgroup>
          <tbody>
          <tr className="kepala-skema">
            <th />
            {irr.skema.map((s, i) => (
              <th key={i}>
                <span className="kepala-cb">
                  <IsianNama id={`irr-nama-${i}`} nilai={s.nama} disabled={ro} lebar={120}
                             lain={irr.skema.filter((_, j) => j !== i).map((x) => x.nama)}
                             ubah={(v) => ganti(i, v)} />
                  {/* Hapus langsung dari judul kolom; konfirmasi di baris bawah tabel. */}
                  {bolehUbah && irr.skema.length > 1 && !s.acuan && (
                    <button className="kecil hapus-cb" aria-label={kt.hapusNama(s.nama)}
                            title={kt.hapusCbJudul}
                            onClick={() => setYakinHapus(i)}>×</button>
                  )}
                </span>
                {yakinHapus === i && (
                  <span className="row" style={{ margin: "4px 0 0", gap: 4, flexWrap: "nowrap", justifyContent: "center" }}>
                    <button className="kecil bahaya" onClick={() => hapusSkema(i)}>{kt.yaHapus}</button>
                    <button className="kecil" onClick={() => setYakinHapus(null)}>{kt.batal}</button>
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr className="grup"><td colSpan={irr.skema.length + 1}>{kt.grupParam}</td></tr>
          <tr><td>{kt.kelompok}</td>{irr.skema.map((s, i) => (
            <td key={i}><IsianTeks nilai={s.kelompok} lebar={70} disabled={ro}
                                   ubah={(v) => ubahSkema(i, (x) => ({ ...x, kelompok: v }))} /></td>))}</tr>
          <tr><td>{kt.alokasi}{" "}
            {/* Total allocation di samping labelnya; merah bila belum 100%. */}
            <b className={Math.abs(hasil.irr.totalAlokasi - 1) > 1e-9 ? "alokasi-kurang" : "alokasi-pas"}>
              {persen(hasil.irr.totalAlokasi, 1, 1)}</b></td>{irr.skema.map((s, i) => (
            <td key={i}>
              <Isian jenis="persen" desimal={1} nilai={s.alokasi} lebar={60} disabled={ro}
                     ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr,
                       skema: aturAlokasi(d.irr.skema, i, n) } }))} />
            </td>))}</tr>
          <tr><td>DP</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian jenis="persen" nilai={s.dp} lebar={60} disabled={ro}
                               ubah={(n) => ubahArus(i, (x) => ({ ...x, dp: n }))} /></td>))}</tr>
          <tr><td>{kt.cicilan}</td>{irr.skema.map((s, i) => (
            <td key={i}><Isian nilai={s.kali} lebar={60} disabled={ro}
                               ubah={(n) => ubahArus(i, (x) => ({ ...x, kali: Math.max(1, Math.round(n)) }))} /></td>))}</tr>
          <tr className="grup"><td colSpan={irr.skema.length + 1}>
            {kt.grupBulan}</td></tr>
          {TAHAP.map((t, ti) => (
            <tr key={t}><td>{t}</td>{irr.skema.map((s, i) => (
              <td key={i}><Isian nilai={s.bulan[ti]} lebar={60} disabled={ro}
                                 ubah={(n) => ubahArus(i, (x) => {
                                   const b = [...x.bulan] as typeof x.bulan; b[ti] = Math.round(n);
                                   return { ...x, bulan: b };
                                 })} /></td>))}</tr>
          ))}
          <tr className="grup"><td colSpan={irr.skema.length + 1}>{kt.grupHasil}</td></tr>
          <tr>
            <td>
              {kt.hargaTunai}
              {bolehUbah && (
                <button className="kecil" style={{ display: "block", marginTop: 4 }}
                        onClick={() => setEditKas((x) => !x)}>
                  {editKas ? kt.selesai : kt.edit}</button>
              )}
            </td>
            {/* Satu Cash Price untuk semua cara bayar; Adjusted Price tiap
                cara bayar = angka ini × koefisiennya. */}
            <td colSpan={irr.skema.length} className="kas-tunggal">
              {editKas && bolehUbah
                ? <Isian id="irr-kas" jenis="rp" nilai={hargaKasIrr(irr)} lebar={160}
                         ubah={(n) => ubah((d) => ({ ...d, irr: { ...d.irr, hargaKas: n } }))} />
                : <b>{rp(hargaKasIrr(irr))}</b>}
              <span className="hint" style={{ margin: "0 0 0 10px" }}>
                {kt.kasInfo}
              </span>
            </td>
          </tr>
          {/* Baris pilihan acuan dihapus atas permintaan pemakai: acuannya selalu
              Cash Keras (koefisien 1), dan baris IRR sudah menandainya. */}
          <tr className="hasil"><td>{kt.koef}</td>{irr.skema.map((s, i) => (
            <td key={i} className="n" title={hasil.irr.koef[s.nama]?.toFixed(5)}><b>{Number.isFinite(hasil.irr.koef[s.nama])
              ? hasil.irr.koef[s.nama].toFixed(3) : "—"}</b></td>))}</tr>
          <tr className="hasil"><td>IRR</td>{irr.skema.map((s, i) => (
            <td key={i} className={`n${belumSesuai.has(s.nama) ? " belum-sesuai" : ""}`}
                title={belumSesuai.has(s.nama) ? kt.belumTepat : undefined}>
              {s.acuan ? "0,0%" : belumSesuai.has(s.nama) ? persen(hasil.irr.irr[s.nama], 5)
                : persen(hasil.irr.irr[s.nama], 1, 1)}
            </td>))}</tr>
          <tr className="hasil"><td>{kt.hargaSesuai}</td>{irr.skema.map((s, i) => (
            <td key={i} className="n"
                title={s.hargaSesuai && !s.acuan ? kt.dariExcel : kt.dariTarget}>
              <b>{rp(hargaSesuaiSkema(irr, hasil.irr.koef[s.nama]))}</b>
              {s.hargaSesuai && !s.acuan ? <small className="asal">Excel</small> : null}
            </td>))}</tr>
          {bolehUbah && (
            <tr><td />{irr.skema.map((s, i) => (
              <td key={i}>
                {yakinHapus === i ? (
                  <span className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap" }}>
                    <button className="kecil bahaya" onClick={() => hapusSkema(i)}>{kt.yaHapus}</button>
                    <button className="kecil" onClick={() => setYakinHapus(null)}>{kt.batal}</button>
                  </span>
                ) : (
                  <button className="kecil" disabled={irr.skema.length <= 1 || !!s.acuan}
                          title={kt.hapusCbInfo}
                          onClick={() => setYakinHapus(i)}>{kt.hapus}</button>
                )}
              </td>))}</tr>
          )}
        </tbody></table>
      </div>
      {belumSesuai.size > 0 && (
        <div className="banner warn" style={{ marginTop: 10, marginBottom: 0 }}>
          <b>{kt.irrBelum(belumSesuai.size, persen(irr.target))}</b>
          {kt.irrBelumInfo}
          {bolehUbah && (
            <div style={{ marginTop: 8 }}>
              <button className="pri"
                      onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr, skema: tanpaSimpanan(d) } }))}>
                {kt.samakan(persen(irr.target))}</button>
            </div>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <span className="hint" style={{ margin: 0 }}>
          {kt.totAlok} <b>{persen(hasil.irr.totalAlokasi)}</b> · {kt.waKoef}{" "}
          <b>{hasil.irr.koefRata.toFixed(3)}</b> · {kt.alokInfo}
        </span>
        {bolehUbah && Math.abs(hasil.irr.totalAlokasi - 1) > 1e-9 && (
          <button onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr, skema: genapkanAlokasi(d.irr.skema) } }))}>
            {kt.genapkan}</button>
        )}
        {bolehUbah && (
          <button onClick={() => ubah((d) => ({ ...d, irr: { ...d.irr,
            skema: d.irr.skema.map((s, j, a) => ({ ...s, alokasi: bagiSebanding(a.map(() => 0), 10000)[j] / 10000 })) } }))}>
            {kt.bagiRata}</button>
        )}
        {bolehUbah && <button onClick={tambahSkema}>{kt.tambahCb}</button>}
        {bolehUbah && baruDitambah > 0 && irr.skema.length > 1 && (
          <button onClick={batalTambah}>{kt.batalTambah}</button>
        )}
      </div>
    </>
  );
}

// ── 2. Unit Data ───────────────────────────────────────────────────────────

/** Faktor posisi BIO DISTRICT, urut seperti di berkas Unit Data-nya. */
const FAKTOR_BIO: KunciFaktor[] = ["singleRow", "tusukSate", "roundAround", "hoek", "luckyNumber"];

const TEKS_UNIT = [
  ["kode", "Code", 130], ["alamat", "Address", 130], ["view", "View", 85],
  ["no", "No", 40], ["ukuran", "Ukuran", 100], ["phase", "Phase", 45],
  ["tipeBangunan", "Type", 45], ["view2", "View", 85], ["bentuk", "Sub-Tipe Kavling/Irr/Irr Hoek", 110],
  ["subTipe", "Sub-Tipe", 110],
] as const;

export function LangkahUnit({ data, hasil, ubah, bolehUbah, slug }: PropsLangkah & { slug?: string | null }) {
  const kt = useKata(KATA);
  // BIO DISTRICT mengikuti urutan kolom berkas Unit Data-nya: Tahap (Phase)
  // sesudah GFA (dasar) Termasuk PPN, tanpa Arah Hadap kedua, faktor Single
  // Row · Tusuk Sate · Round Around · Hoek · Lucky Number, Biaya AJB + BPHTB,
  // Special %, dan harga Dasar/Setelah Faktor Belum PPN lalu Termasuk PPN.
  // Kolom Floor, harga per m² Roundup (ROUNDUP ratus ribu, keterangan saja —
  // harga tetap dihitung dengan rumus sistem), dan Biaya AJB + BPHTB hanya
  // tampil di BIO. Proyek lain tetap seperti semula.
  const bio = slug === "bio-district";
  const teksUnit = bio ? TEKS_UNIT.filter(([k]) => k !== "phase" && k !== "view2") : TEKS_UNIT;
  const ro = !bolehUbah;
  const ppn = tarifPpn(data), lp = labelPpn(ppn);
  const fk = bio
    ? [...FAKTOR_BIO.map((k) => FAKTOR.find(([x]) => x === k)!),
       ...FAKTOR.filter(([k]) => !FAKTOR_BIO.includes(k) && data.unit.some((u) => u.faktor[k]))]
    : faktorTampil(data.unit);
  // Kolom Khusus (Rp) tidak ada di berkas BIO; tetap tampil bila ada isinya.
  const kolomKhusus = !bio || data.unit.some((u) => u.special);
  const kolomPlus = !bio || data.unit.some((u) => u.faktorTambah);
  // BIO: harga tampil dalam rupiah bulat seperti Excel-nya; nilainya tetap utuh.
  const rpHarga = (n: number) => rp(bio && Number.isFinite(n) ? Math.round(n) : n);
  // Pembagi Harga Dasar Termasuk PPN (Excel BIO: ROUNDUP(…)/1,005); tampil bila dipakai.
  const kolomPembagi = bio && data.unit.some((u) => u.pembagiIncl);
  const ratusRibu = (n: number | undefined) => n == null ? undefined : Math.ceil(n / 1e5 - 1e-9) * 1e5;
  const urutanHarga = (bio
    ? [["base", "excl"], ["factored", "excl"], ["base", "incl"], ["factored", "incl"]]
    : [["base", "excl"], ["base", "incl"], ["factored", "excl"], ["factored", "incl"]]) as
    ["base" | "factored", "excl" | "incl"][];
  // Base dan Factored Price dalam dua bentuk, sebelum dan sesudah PPN. Yang
  // dihitung adalah basis project-nya (Incl PPN, atau Excl PPN untuk Permai
  // Indah); bentuk satunya diturunkan dengan tarif PPN yang sama.
  const ppnDua = (n: number) => data.basisExclPpn
    ? { excl: n, incl: Math.round(n * (1 + ppn)) } : { excl: Math.round(n / (1 + ppn)), incl: n };
  // Harga satu unit: Belum PPN yang dihitung sendiri (BIO DISTRICT) bila ada,
  // selain itu diturunkan dari harga Termasuk PPN.
  const hargaUnit = (h: HasilSusun["baris"][number]["hasilUnit"] | undefined, k: "base" | "factored") => {
    const x = h?.[k === "base" ? "baseExcl" : "factoredExcl"];
    return x != null ? { excl: x, incl: h![k] } : ppnDua(h?.[k] ?? NaN);
  };
  const [cari, setCari] = useState("");
  const ubahUnit = (i: number, f: (u: UnitData) => UnitData) =>
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) => j === i ? f(u) : u) }));
  const q = cari.trim().toLowerCase();
  const tampil = data.unit.map((u, i) => ({ u, i, b: hasil.baris[i] }))
    .filter(({ u }) => !q || [u.kode, u.alamat, u.view, u.subTipe].join(" ").toLowerCase().includes(q));
  const total = hasil.baris.reduce((a, b) => a + b.hasilUnit.factored, 0);

  // Menambah dan mengurangi unit. Unit baru disisipkan tepat di bawah baris
  // asalnya (Salin) atau di akhir tabel (Tambah unit), dengan isian yang
  // biasanya sama untuk satu cluster sudah terisi; kotak Code-nya langsung
  // disorot supaya kode unit barunya dapat segera diketik.
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  // Increase massal: satu persen untuk semua unit atau hanya unit terpilih.
  const [kenaikan, setKenaikan] = useState(0);
  const [pesanKenaikan, setPesanKenaikan] = useState<string | null>(null);
  const terapkanKenaikan = (hanyaTerpilih: boolean) => {
    const n = hanyaTerpilih ? pilih.size : data.unit.length;
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) =>
      !hanyaTerpilih || pilih.has(j) ? { ...u, kenaikan } : u) }));
    setPesanKenaikan(kt.pesanKenaikan(persen(kenaikan), n, hanyaTerpilih));
  };
  // (+) Factor massal (mis. Gimmick 1%), sama caranya dengan Increase massal.
  const [faktorTambah, setFaktorTambah] = useState(0);
  const [pesanFaktor, setPesanFaktor] = useState<string | null>(null);
  const terapkanFaktor = (hanyaTerpilih: boolean) => {
    const n = hanyaTerpilih ? pilih.size : data.unit.length;
    ubah((d) => ({ ...d, unit: d.unit.map((u, j) =>
      !hanyaTerpilih || pilih.has(j) ? { ...u, faktorTambah } : u) }));
    setPesanFaktor(kt.pesanFaktor(persen(faktorTambah, 2, 1), n, hanyaTerpilih));
  };
  const [yakin, setYakin] = useState<number | "pilihan" | null>(null);
  const [fokus, setFokus] = useState<number | null>(null);
  useEffect(() => {
    if (fokus == null) return;
    const el = document.getElementById(`unit-kode-${fokus}`) as HTMLInputElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    el?.focus();
    setFokus(null);
  }, [fokus, data.unit.length]);
  const tambah = (dari?: number) => {
    const asal = dari != null ? data.unit[dari] : data.unit[data.unit.length - 1];
    const baru: UnitData = dari != null
      ? { ...asal, kode: "", no: "", faktor: { ...asal.faktor } }
      : { ...unitKosong(), ...(asal && {
          alamat: asal.alamat, hargaTanah: asal.hargaTanah, hargaBangunan: asal.hargaBangunan,
          lb: asal.lb, tipe: asal.tipe, tipeBangunan: asal.tipeBangunan, phase: asal.phase,
          kenaikan: asal.kenaikan, faktorTambah: asal.faktorTambah }) };
    const posisi = dari != null ? dari + 1 : data.unit.length;
    setCari(""); setPilih(new Set()); setYakin(null);
    ubah((d) => ({ ...d, unit: [...d.unit.slice(0, posisi), baru, ...d.unit.slice(posisi)] }));
    setFokus(posisi);
  };
  const hapus = (hapusIni: Set<number>) => {
    ubah((d) => ({ ...d, unit: d.unit.filter((_, j) => !hapusIni.has(j)) }));
    setPilih(new Set()); setYakin(null);
  };
  const tandai = (i: number, on: boolean) => setPilih((p) => {
    const n = new Set(p); if (on) n.add(i); else n.delete(i); return n;
  });

  // Impor lembar UNIT DATA saja: daftar unit diganti seluruhnya dengan isi
  // berkas, sedangkan Data (IRR), susunan kolom, dan T&C tetap seperti di layar.
  const [buka, setBuka] = useState(false);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const imporUnit = async () => {
    if (!berkas) return;
    setSibuk(true); setPesan(null);
    try {
      const fd = new FormData(); fd.append("file", berkas);
      const res = await fetch("/api/pricelist/susun/impor?bagian=unit", { method: "POST", body: fd });
      const b = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login"; return; }
      if (!res.ok) { setPesan({ ok: false, teks: b.detail ?? b.title ?? `HTTP ${res.status}` }); return; }
      const unit: UnitData[] = b.unit ?? [];
      if (!unit.length) {
        setPesan({ ok: false, teks: (b.peringatan ?? []).join(" ") ||
          kt.tidakAdaUnit });
        return;
      }
      // Phase dan Tipe pricelist tidak selalu tertulis di UNIT DATA; untuk
      // unit yang sudah ada di tabel, isian lamanya dipertahankan.
      ubah((d) => {
        const lama = new Map(d.unit.map((u) => [u.kode, u]));
        return { ...d, unit: unit.map((u) => ({
          ...u,
          phase: u.phase || lama.get(u.kode)?.phase || "1",
          tipe: u.tipe || lama.get(u.kode)?.tipe || "",
        })) };
      });
      setPesan({ ok: true, teks: kt.unitDimuat(unit.length, berkas.name,
        b.peringatan?.length ? b.peringatan.join(" ") : undefined) });
      setBuka(false); setBerkas(null);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <>
      <p className="hint kiri">
        {kt.unitHint(data.bulatBiasa ? "ROUND" : "ROUNDUP", !!data.basisExclPpn, data.bulatBase ?? 6, lp)}
      </p>
      <div className="filters rapat param-irr" style={{ marginBottom: 12 }}>
        <div>
          <div className="lbl">{kt.tarifPpn}</div>
          <Isian id="unit-ppn" jenis="persen" nilai={ppn} lebar={70} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, ppn: n }))} />
        </div>
        <p className="hint kiri" style={{ margin: 0, alignSelf: "flex-end", maxWidth: 520 }}>
          {kt.ppnInfo}
        </p>
      </div>
      <div className="row">
        <input id="unit-cari" type="search" placeholder={kt.cariUnit}
               value={cari} onChange={(e) => setCari(e.target.value)} style={{ width: 240 }} />
        <span className="hint" style={{ margin: 0 }}>
          {kt.ringkasUnit(data.unit.length)} <b>{rp(total)}</b>
        </span>
        {bolehUbah && <button className="pri" onClick={() => tambah()}>{kt.tambahUnit}</button>}
        {bolehUbah && pilih.size > 0 && (yakin === "pilihan" ? (
          <span className="yakin-hapus">
            {kt.yakinHapusUnit(pilih.size)}
            <button className="kecil bahaya" onClick={() => hapus(pilih)}>{kt.yaHapus}</button>
            <button className="kecil" onClick={() => setYakin(null)}>{kt.batal}</button>
          </span>
        ) : (
          <button onClick={() => setYakin("pilihan")}>{kt.hapusTerpilih(pilih.size)}</button>
        ))}
        {bolehUbah && (
          <button onClick={() => { setBuka((x) => !x); setPesan(null); }}>
            {kt.imporUnit}</button>
        )}
        <button onClick={() => { location.href = "/api/pricelist/susun/template-unit"; }}>
          {kt.unduhTemplat}</button>
      </div>
      {bolehUbah && data.unit.length > 0 && (
        <div className="row increase-massal">
          <b>{kt.kenaikan}</b>
          <Isian id="unit-increase-massal" jenis="persen" nilai={kenaikan} lebar={70}
                  ubah={(n) => { setKenaikan(n); setPesanKenaikan(null); }} />
          <button onClick={() => terapkanKenaikan(false)}>{kt.semuaUnit(data.unit.length)}</button>
          <button disabled={!pilih.size} onClick={() => terapkanKenaikan(true)}
                  title={pilih.size ? undefined : kt.centangDulu}>
            {kt.unitTerpilih(pilih.size)}</button>
          <span className="hint" style={{ margin: 0 }}>
            {pesanKenaikan ?? kt.kenaikanInfo}
          </span>
        </div>
      )}
      {bolehUbah && data.unit.length > 0 && (
        <div className="row increase-massal">
          <b>{kt.faktorPlus}</b>
          <Isian id="unit-faktor-massal" jenis="persen" desimal={1} nilai={faktorTambah} lebar={70}
                  ubah={(n) => { setFaktorTambah(n); setPesanFaktor(null); }} />
          <button onClick={() => terapkanFaktor(false)}>{kt.semuaUnit(data.unit.length)}</button>
          <button disabled={!pilih.size} onClick={() => terapkanFaktor(true)}
                  title={pilih.size ? undefined : kt.centangDulu}>
            {kt.unitTerpilih(pilih.size)}</button>
          <span className="hint" style={{ margin: 0 }}>
            {pesanFaktor ?? kt.faktorInfo}
          </span>
        </div>
      )}
      {buka && (
        <div className="form-blok">
          <p className="hint kiri" style={{ marginTop: 0 }}>
            {kt.imporHint1} <b>UNIT DATA</b> {kt.imporHint2}{" "}
            <a href="/api/pricelist/susun/template-unit" download>{kt.imporHint3}</a> {kt.imporHint4}
          </p>
          <div className="row" style={{ marginBottom: 0 }}>
            <PilihBerkas accept=".xlsx" onChange={(e) => setBerkas(e.target.files?.[0] ?? null)} />
            <button className="pri" disabled={!berkas || sibuk} onClick={() => void imporUnit()}>
              {sibuk ? kt.membaca : kt.muatUnit}</button>
            <button onClick={() => { setBuka(false); setBerkas(null); }}>{kt.batal}</button>
          </div>
        </div>
      )}
      {pesan && <div className={`banner ${pesan.ok ? "ok" : "stop"}`}>{pesan.teks}</div>}
      {!data.unit.length ? (
        <div className="banner info">
          {kt.kosongUnit1} <b>{kt.imporUnit}</b>{kt.kosongUnit2} <b>{kt.imporSemua}</b> {kt.kosongUnit3}
        </div>
      ) : (
        <div className="tscroll" style={{ maxHeight: 620, overflowY: "auto" }}>
          <table className="tabel-ringkas tabel-isian kepala-lekat tabel-unit"><thead>
            <tr>
              {bolehUbah && (
                <th className="aksi-unit">
                  <input type="checkbox" aria-label={kt.pilihSemuaUnit}
                         checked={tampil.length > 0 && tampil.every(({ i }) => pilih.has(i))}
                         onChange={(e) => setPilih(e.target.checked ? new Set(tampil.map(({ i }) => i)) : new Set())} />
                </th>
              )}
              <th className="no-unit">#</th>
              {teksUnit.map(([k]) => <th key={k}>{bio && k === "ukuran" ? "Dimensi" : kt.teksUnit[k]}</th>)}
              {bio && <th>{kt.floor}</th>}
              <th>{kt.tanahM2}</th>
              <th>{kt.hargaTanah}<br />{kt.excl(lp)}</th>
              {bio && <th className="incl">{kt.hargaTanah} {kt.pembulatan}<br />{kt.incl(lp)}</th>}
              <th className="incl">{kt.hargaTanah}<br />{kt.incl(lp)}</th>
              <th>{kt.gfaM2}</th>
              <th>{kt.hargaBangunan}<br />{kt.excl(lp)}</th>
              {bio && <th className="incl">{kt.hargaBangunan} {kt.pembulatan}<br />{kt.incl(lp)}</th>}
              <th className="incl">{kt.hargaBangunan}<br />{kt.incl(lp)}</th>
              {bio && <th>{kt.teksUnit.phase}</th>}
              <th>{kt.kenaikan}</th>
              {fk.map(([, l]) => <th key={l}>{l}</th>)}
              {kolomPlus && <th>{kt.faktorPlus}</th>}
              {bio && <><th>{kt.biayaAjb}</th><th>Special %</th></>}
              {kolomKhusus && <th>{kt.special}</th>}<th>{kt.showUnit}</th>
              {kolomPembagi && <th>{kt.pembagi}</th>}
              {urutanHarga.map(([h, j]) => (
                <th key={h + j} className={j === "incl" ? "incl" : undefined}>
                  {h === "base" ? kt.hargaDasar : kt.hargaFaktor}<br />{j === "incl" ? kt.incl(lp) : kt.excl(lp)}</th>
              ))}
            </tr>
          </thead><tbody>
            {tampil.map(({ u, i, b }) => (
              <tr key={i} className={pilih.has(i) ? "terpilih" : undefined}>
                {bolehUbah && (
                  <td className="aksi-unit">
                    <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 4 }}>
                      <input type="checkbox" aria-label={kt.pilihBaris(u.kode || kt.baris(i + 1))}
                             checked={pilih.has(i)} onChange={(e) => tandai(i, e.target.checked)} />
                      {yakin === i ? (
                        <>
                          <button className="kecil bahaya" onClick={() => hapus(new Set([i]))}>{kt.yaHapus}</button>
                          <button className="kecil" onClick={() => setYakin(null)}>{kt.batal}</button>
                        </>
                      ) : (
                        <>
                          <button className="kecil" title={kt.salinInfo}
                                  onClick={() => tambah(i)}>{kt.salin}</button>
                          <button className="kecil" title={kt.hapusUnitInfo} onClick={() => setYakin(i)}>{kt.hapus}</button>
                        </>
                      )}
                    </span>
                  </td>
                )}
                <td className="n no-unit">{i + 1}</td>
                {teksUnit.map(([k, , w]) => (
                  <td key={k}><IsianTeks id={k === "kode" ? `unit-kode-${i}` : undefined}
                                         nilai={u[k] ?? ""} lebar={w} disabled={ro}
                                         ubah={(v) => ubahUnit(i, (x) => ({ ...x, [k]: v }))} /></td>
                ))}
                {bio && <td><Isian nilai={u.floor ?? 0} kosongNol desimal={1} lebar={70} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, floor: n }))} /></td>}
                <td><Isian nilai={u.lt} desimal={1} lebar={70} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lt: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaTanah} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaTanah: n }))} /></td>
                {bio && <td className="n">{rpPolos(ratusRibu(b?.hasilUnit.hargaTanahPpn))}</td>}
                <td className="n">{rpPolos(b?.hasilUnit.hargaTanahPpn)}</td>
                <td><Isian nilai={u.lb} desimal={bio ? 1 : undefined} lebar={bio ? 70 : 60} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, lb: n }))} /></td>
                <td><Isian jenis="rp" nilai={u.hargaBangunan} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, hargaBangunan: n }))} /></td>
                {bio && <td className="n">{rpPolos(ratusRibu(b?.hasilUnit.hargaBangunanPpn))}</td>}
                <td className="n">{rpPolos(b?.hasilUnit.hargaBangunanPpn)}</td>
                {bio && (
                  <td><IsianTeks nilai={u.phase ?? ""} lebar={70} disabled={ro}
                                 ubah={(v) => ubahUnit(i, (x) => ({ ...x, phase: v }))} /></td>
                )}
                <td><Isian jenis="persen" kosongNol desimal={bio ? 2 : 1} nilai={u.kenaikan} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, kenaikan: n }))} /></td>
                {fk.map(([k]) => (
                  <td key={k}><Isian jenis="persen" kosongNol desimal={bio ? 1 : undefined} nilai={u.faktor[k] ?? 0} lebar={55} disabled={ro}
                                     ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktor: { ...x.faktor, [k]: n } }))} /></td>
                ))}
                {kolomPlus && <td><Isian jenis="persen" desimal={1} nilai={u.faktorTambah} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, faktorTambah: n }))} /></td>}
                {bio && <>
                  <td><Isian jenis="persen" kosongNol desimal={1} nilai={u.biayaAjb ?? 0} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, biayaAjb: n }))} /></td>
                  <td><Isian jenis="persen" kosongNol desimal={1} nilai={u.specialPersen ?? 0} lebar={55} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, specialPersen: n }))} /></td>
                </>}
                {kolomKhusus && <td><Isian jenis="rp" kosongNol nilai={u.special} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, special: n }))} /></td>}
                <td><Isian jenis="rp" kosongNol nilai={u.showUnit} lebar={95} disabled={ro} ubah={(n) => ubahUnit(i, (x) => ({ ...x, showUnit: n }))} /></td>
                {kolomPembagi && (
                  <td><Isian kosongNol nilai={u.pembagiIncl ?? 0} lebar={60} disabled={ro}
                             ubah={(n) => ubahUnit(i, (x) => ({ ...x, pembagiIncl: n > 0 && n !== 1 ? n : undefined }))} /></td>
                )}
                {urutanHarga.map(([h, j]) => {
                  const n = rpHarga(hargaUnit(b?.hasilUnit, h)[j]);
                  return <td key={h + j} className="n">{h === "factored" ? <b>{n}</b> : n}</td>;
                })}
              </tr>
            ))}
          </tbody><tfoot>
            {/* Jumlah unit yang tampil (ikut pencarian), total Land, GFA, Base dan Factored Price. */}
            <tr className="total-unit">
              <td className="aksi-unit">
                {kt.totalUnit(tampil.length, q ? data.unit.length : undefined)}</td>
              <td colSpan={(bolehUbah ? 0 : -1) + 1 + teksUnit.length} />
              {bio && <td />}
              <td className="n">{luas(tampil.reduce((a, { u }) => a + u.lt, 0), 1)}</td><td /><td />{bio && <td />}
              <td className="n">{luas(tampil.reduce((a, { u }) => a + u.lb, 0))}</td><td /><td />{bio && <><td /><td /></>}<td />
              {fk.map(([k]) => <td key={k} />)}
              {kolomPlus && <td />}{bio && <><td /><td /></>}
              {kolomKhusus && <td />}<td />{kolomPembagi && <td />}
              {urutanHarga.map(([h, j]) => (
                <td key={h + j} className="n">{rpHarga(tampil.reduce((a, { b }) => a + (hargaUnit(b?.hasilUnit, h)[j] || 0), 0))}</td>
              ))}
            </tr>
          </tfoot></table>
        </div>
      )}
      {bolehUbah && data.unit.length > 0 && (
        <div className="row" style={{ marginTop: 10, marginBottom: 0 }}>
          <button onClick={() => tambah()}>{kt.tambahAkhir}</button>
          <span className="hint" style={{ margin: 0 }}>
            {kt.simpanInfo1} <b>{kt.simpan}</b>{kt.simpanInfo2}
          </span>
        </div>
      )}
      <CatatanUnit data={data} ubah={ubah} ro={ro} />
    </>
  );
}

/** Paling banyak sekian gambar per catatan (sama dengan batas di server). */
const MAKS_GAMBAR = 10;

/**
 * Perkecil gambar besar sebelum diunggah: screenshot penuh layar atau foto
 * kamera bisa beberapa MB. Gambar di atas 1,5 MB atau lebih lebar/tinggi dari
 * 2000 px diubah menjadi JPEG 2000 px; gambar kecil diunggah apa adanya.
 */
async function perkecilGambar(f: File): Promise<File> {
  if (f.type === "image/gif") return f;
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) return f;
  const skala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (f.size <= 1.5 * 1024 * 1024 && skala === 1) return f;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * skala); c.height = Math.round(bmp.height * skala);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.88));
  if (!blob) return f;
  return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * Catatan Unit Data: tulisan dan gambar (mis. screenshot persetujuan harga).
 * Gambar dipilih lewat tombol atau ditempel (Ctrl + V) di kotak catatan;
 * gambar langsung diunggah, dan rujukannya ikut tersimpan saat Simpan.
 */
function CatatanUnit({ data, ubah, ro }: {
  data: SusunPricelist; ubah: PropsLangkah["ubah"]; ro: boolean;
}) {
  const kt = useKata(KATA);
  const gambar = data.catatanGambar ?? [];
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const unggah = async (files: File[]) => {
    const sisa = MAKS_GAMBAR - gambar.length;
    if (!files.length) return;
    if (sisa <= 0) { setGalat(kt.maksGambar(MAKS_GAMBAR)); return; }
    setSibuk(true); setGalat(null);
    try {
      for (const asli of files.slice(0, sisa)) {
        const f = await perkecilGambar(asli);
        const fd = new FormData(); fd.append("file", f, f.name);
        const res = await fetch("/api/pricelist/susun/gambar", { method: "POST", body: fd });
        const b = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = "/login"; return; }
        if (!res.ok) { setGalat(`${asli.name}: ${b.detail ?? b.title ?? `HTTP ${res.status}`}`); continue; }
        ubah((d) => ({ ...d, catatanGambar: [...(d.catatanGambar ?? []), { id: b.id, nama: b.nama }] }));
      }
      if (files.length > sisa) setGalat(kt.hanyaSisa(sisa, MAKS_GAMBAR));
    } finally {
      setSibuk(false);
    }
  };

  // Tempel screenshot (Windows + Shift + S lalu Ctrl + V). Bila papan klip
  // juga berisi tulisan (mis. salinan sel Excel), yang ditempel tulisannya.
  const tempel = (e: React.ClipboardEvent) => {
    if (ro || e.clipboardData.getData("text/plain")) return;
    const files = [...e.clipboardData.items]
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it, i) => {
        const f = it.getAsFile()!;
        const jam = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
        return new File([f], `screenshot-${jam}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`,
                        { type: f.type });
      });
    if (!files.length) return;
    e.preventDefault();
    void unggah(files);
  };

  return (
    <div style={{ marginTop: 14 }}>
      <label className="lbl" htmlFor="unit-catatan">{kt.catatan}</label>
      <textarea id="unit-catatan" className="catatan-unit" rows={3} maxLength={5000}
                disabled={ro} value={data.catatanUnit ?? ""} onPaste={tempel}
                onChange={(e) => { const v = e.target.value; ubah((d) => ({ ...d, catatanUnit: v })); }} />
      {gambar.length > 0 && (
        <div className="gambar-catatan">
          {gambar.map((g) => (
            <figure key={g.id}>
              <a href={`/api/pricelist/susun/gambar/${g.id}`} target="_blank" rel="noreferrer"
                 title={kt.bukaGambar}>
                <img src={`/api/pricelist/susun/gambar/${g.id}`} alt={g.nama} loading="lazy" />
              </a>
              <figcaption>
                <span title={g.nama}>{g.nama}</span>
                {!ro && (
                  <button className="kecil bahaya" aria-label={kt.hapusNama(g.nama)}
                          onClick={() => ubah((d) => ({ ...d,
                            catatanGambar: (d.catatanGambar ?? []).filter((x) => x.id !== g.id) }))}>
                    {kt.hapus}</button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {galat && <div className="banner stop" style={{ marginTop: 8 }}>{galat}</div>}
      <div className="row" style={{ margin: "6px 0 0", alignItems: "center" }}>
        {!ro && (
          <label className="tombol-berkas">
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                   disabled={sibuk || gambar.length >= MAKS_GAMBAR}
                   onChange={(e) => { void unggah([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {sibuk ? kt.mengunggah : kt.tambahGambar}
          </label>
        )}
        <span className="hint" style={{ margin: 0 }}>
          {kt.tempel1} <b>Ctrl + V</b> {kt.tempel2}
          <b> {kt.tambahGambar}</b> {kt.tempel3(MAKS_GAMBAR)} <b>{kt.simpan}</b>.
        </span>
      </div>
    </div>
  );
}

/**
 * Kenaikan bertingkat satu cara bayar: tiap tingkat punya % dan Nilai (Rp),
 * dan dihitung dari hasil tingkat sebelumnya.
 */
function KenaikanBertingkat({ tingkat, ubah, disabled }: {
  tingkat: { persen: number; rp: number }[];
  ubah: (t: { persen: number; rp: number }[]) => void; disabled?: boolean;
}) {
  const kt = useKata(KATA);
  const ganti = (j: number, p: Partial<{ persen: number; rp: number }>) =>
    ubah(tingkat.map((t, m) => m === j ? { ...t, ...p } : t));
  return (
    <div className="naik-tingkat">
      {tingkat.map((t, j) => (
        <div key={j} className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap", alignItems: "center" }}>
          {tingkat.length > 1 && <span className="hint" style={{ margin: 0, minWidth: 18 }}>{j + 1}.</span>}
          <Isian jenis="persen" kosongNol desimal={1} nilai={t.persen} lebar={60} disabled={disabled}
                 ubah={(n) => ganti(j, { persen: n })} />
          <Isian jenis="rp" kosongNol nilai={t.rp} lebar={110} disabled={disabled}
                 ubah={(n) => ganti(j, { rp: n })} />
          {!disabled && (
            <button className="kecil" aria-label={kt.hapusTingkat(j + 1)}
                    onClick={() => ubah(tingkat.filter((_, m) => m !== j))}>×</button>
          )}
        </div>
      ))}
      {!disabled && (
        <button className="kecil" title={kt.tambahTingkatInfo}
                onClick={() => ubah([...tingkat, { persen: 0, rp: 0 }])}>
          {tingkat.length ? kt.tambahTingkat : kt.tambahKenaikan}</button>
      )}
    </div>
  );
}

// ── 3. Data Pricelist ──────────────────────────────────────────────────────

export function LangkahDataPl({ data, hasil, ubah, bolehUbah }: PropsLangkah) {
  const kt = useKata(KATA);
  const ro = !bolehUbah;
  const kolom = data.dataPricelist.kolom;
  const ubahKolom = (i: number, f: (k: (typeof kolom)[0]) => (typeof kolom)[0]) =>
    ubah((d) => ({ ...d, dataPricelist: { ...d.dataPricelist,
      kolom: d.dataPricelist.kolom.map((k, j) => j === i ? f(k) : k) } }));
  const [yakin, setYakin] = useState<number | null>(null);
  const x0 = (i: number) => kolom[i];

  // Cara bayar baru ditambah di sini saja, tidak masuk Data (IRR), supaya
  // cara bayar normal dan Allocation-nya tidak berubah. Harganya dihitung
  // dari cara bayar lain × pengali (bawaan Cash Keras × 100%) lalu kenaikan
  // bertingkat bila perlu; kolom Pricelist dan blok T&C-nya ikut dibuat.
  const tambahTurunan = () => ubah((d) => {
    const ada = new Set([...d.dataPricelist.kolom.map((k) => k.nama),
                         ...d.pricelist.kolom.map((k) => k.nama), ...d.irr.skema.map((x) => x.nama)]);
    let no = 1;
    while (ada.has(`Kolom turunan ${no}`)) no++;
    const nama = `Kolom turunan ${no}`;
    const dari = d.dataPricelist.kolom[d.dataPricelist.kolom.length - 1]?.nama ?? "";
    return { ...d,
      dataPricelist: { ...d.dataPricelist, kolom: [...d.dataPricelist.kolom, { nama, dari, kali: 1 }] },
      pricelist: { ...d.pricelist, kolom: [...d.pricelist.kolom, { nama, dari: nama, kali: 1 }] } };
  });
  /**
   * Geser kolom i satu langkah (arah -1 naik, +1 turun). Kolom turunan tidak
   * boleh berada di atas kolom sumbernya. Urutan kolom Pricelist ikut urutan
   * kolom sumbernya di sini.
   */
  const bolehTukar = (a: number) =>
    a >= 0 && a + 1 < kolom.length && kolom[a + 1].dari !== kolom[a].nama;
  /** Ubah kolom Harga (langkah 4a) ke-j. */
  const ubahPl = (j: number, f: (x: SusunPricelist["pricelist"]["kolom"][number]) => SusunPricelist["pricelist"]["kolom"][number]) =>
    ubah((d) => ({ ...d, pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.map((x, m) => m === j ? f(x) : x) } }));
  /**
   * Kolom Harga baru dari kolom Data Harga `dari` (pengali 100%), disisipkan
   * mengikuti urutan kolom Data Harga; namanya dibuat unik.
   */
  const tampilkanDiHarga = (dari: string) => ubah((d) => {
    const ada = new Set(d.pricelist.kolom.map((x) => x.nama));
    let nama = dari, no = 2;
    while (ada.has(nama)) nama = `${dari} (${no++})`;
    const posisi = new Map(d.dataPricelist.kolom.map((x, j) => [x.nama, j]));
    const pl = [...d.pricelist.kolom, { nama, dari, kali: 1 }].map((x, j) => ({ x, j }))
      .sort((p, q) => (posisi.get(p.x.dari) ?? 1e9) - (posisi.get(q.x.dari) ?? 1e9) || p.j - q.j)
      .map(({ x }) => x);
    return { ...d, pricelist: { ...d.pricelist, kolom: pl } };
  });
  const geser = (i: number, arah: -1 | 1) => ubah((d) => {
    const k = [...d.dataPricelist.kolom];
    const a = arah < 0 ? i - 1 : i;
    if (a < 0 || a + 1 >= k.length || k[a + 1].dari === k[a].nama) return d;
    [k[a], k[a + 1]] = [k[a + 1], k[a]];
    const posisi = new Map(k.map((x, j) => [x.nama, j]));
    const pl = d.pricelist.kolom.map((x, j) => ({ x, j }))
      .sort((p, q) => (posisi.get(p.x.dari) ?? 1e9) - (posisi.get(q.x.dari) ?? 1e9) || p.j - q.j)
      .map(({ x }) => x);
    return { ...d, dataPricelist: { ...d.dataPricelist, kolom: k },
             pricelist: { ...d.pricelist, kolom: pl } };
  });
  /** Hapus kolom turunan beserta turunannya dan kolom Pricelist yang bersumber darinya. */
  const hapusTurunan = (i: number) => {
    setYakin(null);
    ubah((d) => {
      const hilang = new Set([d.dataPricelist.kolom[i].nama]);
      d.dataPricelist.kolom.forEach((k) => { if (k.dari && hilang.has(k.dari)) hilang.add(k.nama); });
      return { ...d,
        dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.filter((k) => !hilang.has(k.nama)) },
        pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.filter((k) => !hilang.has(k.dari)) } };
    });
  };

  return (
    <>
      <p className="hint kiri">{kt.dpHint}</p>
      <div className="filters rapat" style={{ maxWidth: 300 }}>
        <div>
          <div className="lbl">{kt.tambahanPerUnit}</div>
          <Isian id="dp-tambahan" jenis="rp" nilai={data.dataPricelist.tambahan} lebar={140} disabled={ro}
                 ubah={(n) => ubah((d) => ({ ...d, dataPricelist: { ...d.dataPricelist, tambahan: n } }))} />
        </div>
      </div>
      {/* Judul, tanggal dan catatan Harga (langkah 4a) juga diatur di sini:
          semua pengaturan harga di langkah 3, langkah 4a hanya rinciannya. */}
      <div className="filters rapat" style={{ marginTop: 10 }}>
        <div><div className="lbl">{kt.judul}</div>
          <IsianTeks id="pl-judul" nilai={data.pricelist.judul} lebar={200} disabled={ro}
                     ubah={(v) => ubah((d) => ({ ...d, pricelist: { ...d.pricelist, judul: v } }))} /></div>
        <div><div className="lbl">{kt.tglBerlaku}</div>
          <IsianTeks id="pl-tanggal" nilai={data.pricelist.tanggal} lebar={160} disabled={ro}
                     ubah={(v) => ubah((d) => ({ ...d, pricelist: { ...d.pricelist, tanggal: v } }))} /></div>
        <div style={{ gridColumn: "span 2" }}><div className="lbl">{kt.catatanKpr}</div>
          <input id="pl-catatan" value={data.pricelist.catatan} disabled={ro}
                 onChange={(e) => ubah((d) => ({ ...d, pricelist: { ...d.pricelist, catatan: e.target.value } }))} /></div>
      </div>

      <div className="tscroll sp">
        <table className="tabel-ringkas tabel-isian tabel-rapat"><tbody>
          <tr className="kepala-tengah"><th>{kt.thKolom}</th><th>{kt.thDari}</th><th>{kt.thKoef}</th>
            <th title={kt.thNaikInfo}>
              {kt.thNaik}<br /><span style={{ fontWeight: 400 }}>{kt.thNaikSub}</span></th>
            <th title={kt.thMetodeInfo}>
              {kt.thMetode}<br /><span style={{ fontWeight: 400 }}>{kt.thMetodeSub}</span></th>{!ro && <th />}</tr>
          {kolom.map((k, i) => (
            <tr key={i}>
              <td><IsianNama nilai={k.nama} lebar={190} disabled={ro}
                             lain={kolom.filter((_, j) => j !== i).map((x) => x.nama)}
                             ubah={(v) => ubah((d) => {
                               const lama = d.dataPricelist.kolom[i].nama;
                               return { ...d,
                                 dataPricelist: { ...d.dataPricelist, kolom: d.dataPricelist.kolom.map((x, j) =>
                                   j === i ? { ...x, nama: v } : x.dari === lama ? { ...x, dari: v } : x) },
                                 pricelist: { ...d.pricelist, kolom: d.pricelist.kolom.map((x) =>
                                   x.dari === lama ? { ...x, dari: v } : x) } };
                             })} /></td>
              <td>
                <select value={k.skema ? `s:${k.skema}` : `k:${k.dari ?? ""}`} disabled={ro}
                        onChange={(e) => {
                          const [jenis, nama] = [e.target.value.slice(0, 1), e.target.value.slice(2)];
                          // Kenaikan khusus cara bayar ini ikut terbawa saat sumbernya diganti.
                          const naik = { naikPersen: x0(i).naikPersen, naikRp: x0(i).naikRp, naikTingkat: x0(i).naikTingkat };
                          ubahKolom(i, (x) => jenis === "s" ? { nama: x.nama, skema: nama, ...naik }
                            : { nama: x.nama, dari: nama, kali: x.kali ?? 1, ...naik });
                        }}>
                  <optgroup label={kt.optKoef}>
                    {data.irr.skema.map((s) => <option key={s.nama} value={`s:${s.nama}`}>{s.nama}</option>)}
                  </optgroup>
                  <optgroup label={kt.optTurunan}>
                    {kolom.slice(0, i).map((x) => <option key={x.nama} value={`k:${x.nama}`}>{x.nama}</option>)}
                  </optgroup>
                </select>
              </td>
              <td className="n">
                {k.skema ? (
                  // Koefisien Data (IRR) × pengali, dibulatkan sekali (kosong = 100%).
                  <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 6, justifyContent: "flex-end" }}>
                    {Number.isFinite(hasil.irr.koef[k.skema]) ? hasil.irr.koef[k.skema].toFixed(3) : "—"}
                    <span className="hint" style={{ margin: 0 }}>×</span>
                    <Isian jenis="persen" nilai={k.kali ?? 1} lebar={70} disabled={ro}
                           ubah={(n) => ubahKolom(i, (x) => ({ ...x, kali: n === 1 ? undefined : n }))} />
                  </span>
                ) : <Isian jenis="persen" nilai={k.kali ?? 1} lebar={70} disabled={ro}
                           ubah={(n) => ubahKolom(i, (x) => ({ ...x, kali: n }))} />}
              </td>
              <td>
                <KenaikanBertingkat tingkat={tingkatNaik(k)} disabled={ro}
                                    ubah={(t) => ubahKolom(i, (x) => ({ ...x, naikPersen: undefined,
                                      naikRp: undefined, naikTingkat: t.length ? t : undefined }))} />
              </td>
              {/* Ganti nama yang tampil di Pricelist saja: kolom Pricelist yang
                  bersumber dari kolom ini diganti namanya, hitungannya tetap. */}
              {/* Kolom Harga (langkah 4a) dari kolom ini diatur di sini juga —
                  nama, pengali, pembulatan — supaya tidak ada dua tempat yang
                  harus disamakan (langkah 4a hanya menampilkan ringkasannya). */}
              <td>
                {data.pricelist.kolom.map((p, j) => p.dari !== k.nama ? null : (
                  <span key={j} className="row" style={{ margin: "0 0 4px", flexWrap: "nowrap", gap: 6 }}>
                    <IsianTeks nilai={p.nama} lebar={210} disabled={ro}
                               ubah={(v) => ubahPl(j, (x) => ({ ...x, nama: v }))} />
                    <Isian jenis="persen" nilai={p.kali} lebar={60} disabled={ro}
                           ubah={(n) => ubahPl(j, (x) => ({ ...x, kali: n }))} />
                    <select value={p.bulatAtas ? "atas" : "biasa"} disabled={ro || p.kali === 1}
                            title={p.kali === 1 ? kt.pengali100 : kt.thBulatInfo}
                            onChange={(e) => ubahPl(j, (x) => ({ ...x, bulatAtas: e.target.value === "atas" || undefined }))}>
                      <option value="biasa">ROUND</option>
                      <option value="atas">ROUNDUP</option>
                    </select>
                    {!ro && (
                      <button className="kecil" title={kt.hapusDariHarga} aria-label={kt.hapusDariHarga}
                              disabled={data.pricelist.kolom.length <= 1}
                              onClick={() => ubah((d) => ({ ...d, pricelist: { ...d.pricelist,
                                kolom: d.pricelist.kolom.filter((_, m) => m !== j) } }))}>×</button>
                    )}
                  </span>
                ))}
                {!data.pricelist.kolom.some((p) => p.dari === k.nama) && (
                  <span className="hint" style={{ margin: "0 8px 0 0" }}>{kt.tidakDipakai}</span>
                )}
                {!ro && !data.pricelist.kolom.some((p) => p.dari === k.nama) && (
                  <button className="kecil" onClick={() => tampilkanDiHarga(k.nama)}>{kt.tampilkanDiHarga}</button>
                )}
              </td>
              {!ro && (
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className="row" style={{ margin: "0 6px 0 0", gap: 4, display: "inline-flex" }}>
                    <button className="kecil" title={kt.geserAtas} aria-label={kt.geserNamaAtas(k.nama)}
                            disabled={!bolehTukar(i - 1)} onClick={() => geser(i, -1)}>▲</button>
                    <button className="kecil" title={kt.geserBawah} aria-label={kt.geserNamaBawah(k.nama)}
                            disabled={!bolehTukar(i)} onClick={() => geser(i, 1)}>▼</button>
                  </span>
                  {/* Kolom dari cara bayar dihapus di Data (IRR); di sini hanya turunan. */}
                  {k.skema ? (
                    <span className="hint" style={{ margin: 0 }} title={kt.hapusDiIrrInfo}>
                      {kt.hapusDiIrr}</span>
                  ) : yakin === i ? (
                    <span className="row" style={{ margin: 0, flexWrap: "nowrap", gap: 4 }}>
                      <button className="kecil bahaya" onClick={() => hapusTurunan(i)}>{kt.yaHapus}</button>
                      <button className="kecil" onClick={() => setYakin(null)}>{kt.batal}</button>
                    </span>
                  ) : (
                    <button className="kecil" title={kt.hapusTurunanInfo}
                            onClick={() => setYakin(i)}>{kt.hapus}</button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody></table>
      </div>
      {!ro && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="pri" onClick={() => ubah(denganCaraBayarBaru)}
                  title={kt.tambahCbDpInfo}>
            {kt.tambahCbBesar}</button>
          <button onClick={tambahTurunan}
                  title={kt.tambahTurunanInfo}>
            {kt.tambahTurunan}</button>
          <span className="hint" style={{ margin: 0 }}>
            {kt.cbBaru1} <b>{kt.cbBaru2}</b>{kt.cbBaru3}
          </span>
        </div>
      )}

      <div className="tscroll" style={{ maxHeight: 560, overflowY: "auto" }}>
        {/* Kolom harga sama lebar; judul cara bayar yang panjang dilipat. */}
        <table className="tabel-ringkas kepala-lekat tabel-harga-rata" style={{ whiteSpace: "nowrap" }}><thead>
          <tr>
            <th>{kt.kol.no}</th><th>{kt.kol.kode}</th><th>{kt.kol.phase}</th><th>{kt.kol.alamat}</th><th>{kt.kol.view}</th><th>{kt.kol.ukuran}</th>
            <th>{kt.kol.tipe}</th><th>{kt.kol.subTipe}</th><th>{kt.kol.land}</th><th>{kt.kol.build}</th><th className="kol-harga">{kt.hargaFaktor}</th>
            {kolom.map((k) => <th key={k.nama} className="kol-harga">{k.nama}</th>)}
          </tr>
        </thead><tbody>
          {hasil.baris.map((b, i) => (
            <tr key={i}>
              <td className="n">{i + 1}</td><td><b>{b.unit.kode}</b></td><td>{b.unit.phase}</td>
              <td>{b.unit.alamat}</td><td>{b.unit.view}</td><td>{b.unit.ukuran}</td>
              <td>{b.unit.tipe}</td><td>{b.unit.subTipe}</td>
              <td className="n">{b.unit.lt.toLocaleString("id-ID")}</td>
              <td className="n">{b.unit.lb.toLocaleString("id-ID")}</td>
              <td className="n">{rp(b.hasilUnit.factored)}</td>
              {kolom.map((k) => <td key={k.nama} className="n">{rp(b.dataPl[k.nama])}</td>)}
            </tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}

// ── 4. Pricelist ───────────────────────────────────────────────────────────

/**
 * Isi lembar Harga: judul, tanggal, daftar cara bayar, dan unit beserta
 * harganya — persis angka yang sedang tampil di langkah 4a, termasuk yang
 * belum disimpan. Langkah 4b menyusun tampilannya dari isi yang sama.
 */
export function isiLembar(data: SusunPricelist, hasil: HasilSusun,
                          slug?: string | null): Isi {
  const pl = data.pricelist;
  return {
    judul: pl.judul, tanggal: pl.tanggal, catatan: pl.catatan, slug: slug ?? null,
    kolom: pl.kolom.map((k) => k.nama),
    unit: hasil.baris.map((b) => ({
      kode: b.unit.kode, alamat: b.unit.alamat, tipe: b.unit.tipe,
      lt: b.unit.lt, lb: b.unit.lb, phase: b.unit.phase, ukuran: b.unit.ukuran,
      view: b.unit.view, subTipe: b.unit.subTipe,
      harga: Object.fromEntries(pl.kolom.map((k) => [k.nama, b.pricelist[k.nama]?.harga])),
      pajak: Object.fromEntries(pl.kolom.map((k) => [k.nama,
        { dpp: b.pricelist[k.nama]?.dpp ?? null, dtp: b.pricelist[k.nama]?.dtp ?? null }])),
    })),
  };
}

/**
 * Cetak A4: isi lembarnya diserahkan ke tab cetak lewat localStorage, lalu
 * tab itu dibuka. Susunan tampilannya dibaca tab itu sendiri dari pilihan
 * yang tersimpan per proyek.
 */
export function bukaCetak(isi: Isi) {
  try { localStorage.setItem(KUNCI, JSON.stringify(isi)); }
  catch { /* penyimpanan peramban penuh atau diblokir */ }
  open("/pricelist/cetak-pl", "_blank");
}

export function LangkahPricelist({ data, hasil, ubah, bolehUbah, aksi, slug }: PropsLangkah & {
  /** Panel memberlakukan, disediakan halamannya. */
  aksi?: React.ReactNode;
  slug?: string | null;
}) {
  const kt = useKata(KATA);
  const ro = !bolehUbah;
  const [pajak, setPajak] = useState(true);
  const pl = data.pricelist;
  const kolomDp = data.dataPricelist.kolom.map((k) => k.nama);

  const isi = isiLembar(data, hasil, slug);

  return (
    <>
      <div className="row" style={{ justifyContent: "flex-end", margin: 0 }}>
        <button className="pri" onClick={() => bukaCetak(isi)} disabled={!isi.unit.length}
                title={kt.cetakPlInfo}>
          {kt.cetakA4}</button>
      </div>
      <p className="hint kiri">{kt.plHint(labelPpn(tarifPpn(data)))}</p>
      <div className="banner info">{kt.susunanDiLangkah3}</div>

      {/* Susunan kolom harga diatur di langkah 3 (kolom Perubahan Metode
          Pembayaran); di sini hanya ringkasannya, supaya tidak ada dua tempat
          yang harus disamakan. */}
      <details className="sp" style={{ marginTop: 12 }}>
        <summary className="hint kiri" style={{ cursor: "pointer" }}>{kt.susunan(pl.kolom.length)}</summary>
        <div className="tscroll" style={{ marginTop: 8 }}>
          <table className="tabel-ringkas tabel-rapat"><tbody>
            <tr><th>{kt.thKolomPl}</th><th>{kt.thDariDp}</th><th>{kt.thPengali}</th>
              <th title={kt.thBulatInfo}>{kt.thBulat}</th></tr>
            {pl.kolom.map((k, i) => (
              <tr key={i}>
                <td>{k.nama}</td>
                <td>{kolomDp.includes(k.dari) ? k.dari : kt.tidakAda(k.dari)}</td>
                <td className="n">{(k.kali * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</td>
                <td>{k.kali === 1 ? "—" : k.bulatAtas ? "ROUNDUP" : "ROUND"}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </details>

      <div className="kepala-pl">
        <b>{pl.judul}</b>
        <span>{pl.tanggal}</span>
        {pl.catatan && <small>{pl.catatan}</small>}
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input id="pl-pajak" type="checkbox" checked={pajak} onChange={(e) => setPajak(e.target.checked)} />
          {kt.tampilPajak}
        </label>
        <span className="hint" style={{ margin: 0 }}>{kt.ringkasPl(isi.unit.length, pl.kolom.length)}</span>
      </div>
      {isi.unit.length ? (
        <TabelHarga skema={pl.kolom.map((k) => k.nama)} unit={isi.unit} pajak={pajak} tinggi={560} />
      ) : (
        <div className="banner info">{kt.belumUnit}</div>
      )}
      {aksi}
    </>
  );
}

// ── 5. Terms & Conditions ──────────────────────────────────────────────────

/**
 * Teks awal kolom waktu satu baris T&C, dari labelnya dan cara bayar Data
 * (IRR) di belakangnya. Hanya titik awal; ketentuan sebenarnya diketik orang.
 */
function waktuAwal(label: string, s?: { dp: number; kali: number }): string {
  const l = label.toUpperCase();
  if (/BOOKING|\bBF\b|TANDA JADI|UTJ/.test(l)) return "";
  if (/AKAD/.test(l)) return "Saat akad kredit";
  if (/CICIL/.test(l)) {
    const n = s?.kali ?? (Number(/(\d+)\s*X/.exec(l)?.[1]) || 0);
    return n > 1 ? `Setiap bulan selama ${n} bulan, mulai 1 bulan setelah BF`
      : "Setiap bulan, mulai 1 bulan setelah BF";
  }
  if (/\bDP\b|UANG MUKA/.test(l)) {
    return s && s.dp < 1 && s.kali > 1
      ? `Dicicil ${s.kali}x setiap bulan, mulai 1 bulan setelah BF` : "1 bulan setelah BF";
  }
  if (/PELUNASAN|LUNAS/.test(l)) return "1 bulan setelah BF";
  return "";
}

/**
 * Isi kolom waktu yang masih kosong di setiap blok T&C dengan teks awalnya.
 * Isian yang sudah ditulis tidak disentuh.
 */
export function denganWaktuAwal(d: SusunPricelist): SusunPricelist {
  const kolomDp = new Map(d.dataPricelist.kolom.map((k) => [k.nama, k]));
  const skemaKolom = (nama: string) => {
    let k = kolomDp.get(nama);
    for (let n = 0; k && !k.skema && n < 50; n++) k = k.dari ? kolomDp.get(k.dari) : undefined;
    return d.irr.skema.find((x) => x.nama === k?.skema);
  };
  // Cara bayar di belakang tiap blok: lewat kolom Pricelist yang judulnya cocok.
  const skemaBlok = (judul: string) => {
    const p = d.pricelist.kolom.find((k) => kunciTnc(k.nama) === kunciTnc(judul)
      || kunciTnc(k.dari) === kunciTnc(judul));
    return p ? skemaKolom(p.dari) : undefined;
  };
  let berubah = false;
  const caraBayar = d.tnc.caraBayar.map((c) => {
    const s = skemaBlok(c.judul);
    return { ...c, baris: c.baris.map((b) => {
      if (b.waktu.trim()) return b;
      const w = waktuAwal(b.label, s);
      if (!w) return b;
      berubah = true;
      return { ...b, waktu: w };
    }) };
  });
  return berubah ? { ...d, tnc: { ...d.tnc, caraBayar } } : d;
}

/**
 * Blok T&C untuk setiap kolom Pricelist yang belum punya blok (dicocokkan
 * dengan nama tampilan maupun nama kolom asalnya). Barisnya disusun dari
 * cara bayar di Data (IRR) di belakang kolom itu — Booking Fee, lalu
 * pelunasan, cicilan, atau DP dan sisa KPR — sebagai titik awal yang diubah
 * sesudahnya. Blok yang sudah ada tidak disentuh.
 */

function denganTncLengkap(d: SusunPricelist, hanya?: Set<string>): SusunPricelist {
  const kunci = kunciTnc;
  const ada = new Set(d.tnc.caraBayar.map((c) => kunci(c.judul)));
  const kolomDp = new Map(d.dataPricelist.kolom.map((k) => [k.nama, k]));
  const skemaDari = (nama: string) => {
    let k = kolomDp.get(nama);
    for (let n = 0; k && !k.skema && n < 50; n++) k = k.dari ? kolomDp.get(k.dari) : undefined;
    return d.irr.skema.find((x) => x.nama === k?.skema);
  };
  const pc = (n: number) => `${(n * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
  const baru = d.pricelist.kolom.flatMap((k) => {
    if (hanya && !hanya.has(k.nama)) return [];
    // Kolom yang baru ditambah dicocokkan dengan namanya saja: ia boleh
    // bersumber dari kolom yang sudah punya blok (mis. Cash Keras).
    if (ada.has(kunci(k.nama)) || (!hanya && ada.has(kunci(k.dari)))) return [];
    ada.add(kunci(k.nama));
    const s = skemaDari(k.dari);
    const baris: BarisTnc[] = [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }];
    if (s && s.dp < 1) {
      baris.push({ label: "DP", nilai: pc(s.dp), waktu: "" });
      baris.push({ label: "Pelunasan / Akad", nilai: pc(1 - s.dp), waktu: "" });
    } else if (s && s.kali > 1) {
      baris.push({ label: "Cicilan", nilai: `${s.kali}x`, waktu: "" });
    } else {
      baris.push({ label: "Pelunasan", nilai: "100%", waktu: "" });
    }
    baris.forEach((b) => { b.waktu = waktuAwal(b.label, s); });
    return [{ judul: k.nama.toUpperCase(), baris }];
  });
  return baru.length ? { ...d, tnc: { ...d.tnc, caraBayar: [...d.tnc.caraBayar, ...baru] } } : d;
}

/**
 * Jaga T&C tetap mengikuti kolom Pricelist sesudah setiap perubahan draf:
 * kolom Pricelist baru (dari langkah mana pun) langsung mendapat blok, dan
 * kolom yang namanya diganti membawa judul bloknya. Blok tidak pernah
 * dihapus otomatis — isinya ditulis orang.
 */
export function sinkronTnc(lama: SusunPricelist, baru: SusunPricelist): SusunPricelist {
  if (lama.pricelist.kolom === baru.pricelist.kolom) return baru;
  const namaLama = new Set(lama.pricelist.kolom.map((k) => kunciTnc(k.nama)));
  const namaBaru = new Set(baru.pricelist.kolom.map((k) => kunciTnc(k.nama)));
  let d = baru;
  const tambah = new Set<string>();
  baru.pricelist.kolom.forEach((k, i) => {
    // Nama yang sedang dikosongkan tidak mengubah apa pun.
    if (!kunciTnc(k.nama) || namaLama.has(kunciTnc(k.nama))) return;
    // Ganti nama: kolom di posisi yang sama dulu bernama lain, dan nama lama
    // itu tidak lagi dipakai kolom mana pun — judul bloknya ikut diganti.
    const asal = lama.pricelist.kolom[i];
    const j = asal && !namaBaru.has(kunciTnc(asal.nama))
      ? d.tnc.caraBayar.findIndex((c) => kunciTnc(c.judul) === kunciTnc(asal.nama)) : -1;
    if (j >= 0 && kunciTnc(asal!.nama)) {
      d = { ...d, tnc: { ...d.tnc, caraBayar: d.tnc.caraBayar.map((c, m) =>
        m === j ? { ...c, judul: k.nama.toUpperCase() } : c) } };
    } else {
      tambah.add(k.nama);
    }
  });
  return tambah.size ? denganTncLengkap(d, tambah) : d;
}

export function LangkahTnc({ data, ubah, bolehUbah, slug }: PropsLangkah & { slug?: string | null }) {
  const kt = useKata(KATA);
  const ro = !bolehUbah;
  const t = data.tnc;
  // Cetak A4: isinya (termasuk yang belum disimpan) diserahkan ke tab cetak
  // lewat localStorage, lalu tab itu dibuka.
  const cetak = () => {
    try {
      localStorage.setItem("cetak-tnc", JSON.stringify({
        tnc: data.tnc, tanggal: data.pricelist.tanggal, slug: slug ?? null }));
    } catch { /* penyimpanan peramban penuh atau diblokir */ }
    open("/pricelist/cetak-tnc", "_blank");
  };
  const ubahT = (f: (x: typeof t) => typeof t) => ubah((d) => ({ ...d, tnc: f(d.tnc) }));
  const ubahCb = (i: number, f: (c: (typeof t.caraBayar)[0]) => (typeof t.caraBayar)[0]) =>
    ubahT((x) => ({ ...x, caraBayar: x.caraBayar.map((c, j) => j === i ? f(c) : c) }));

  // Salin T&C dari project lain: format dan cara bayarnya sering sama, jadi
  // tidak perlu diketik ulang. Rekening project ini tidak ikut diganti.
  const [lain, setLain] = useState<{ slug: string; nama: string; jumlah: number }[]>([]);
  const [dari, setDari] = useState("");
  const [pesanSalin, setPesanSalin] = useState<string | null>(null);
  useEffect(() => {
    if (ro) return;
    fetch("/api/pricelist/susun/tnc").then((r) => r.ok ? r.json() : null)
      .then((b) => setLain(b?.project ?? [])).catch(() => {});
  }, [ro]);
  const salin = async () => {
    const p = lain.find((x) => x.slug === dari);
    if (!p) return;
    setPesanSalin(null);
    const r = await fetch(`/api/pricelist/susun/tnc?slug=${encodeURIComponent(p.slug)}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok || !b.tnc) { setPesanSalin(b.detail ?? b.title ?? `HTTP ${r.status}`); return; }
    const x = b.tnc as typeof t;
    const daftar = x.caraBayar.map((c, i) => `${i + 1}. ${c.judul}`).join("\n");
    if (!confirm(kt.yakinSalin(p.nama, daftar, x.catatan.length))) return;
    ubahT((y) => ({ ...y, judul: x.judul, caraBayar: x.caraBayar, catatan: x.catatan }));
    setPesanSalin(kt.disalin(p.nama));
  };

  return (
    <>
      <div className="row" style={{ alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className="filters rapat" style={{ maxWidth: 420, margin: 0 }}>
          <div><div className="lbl">{kt.judul}</div>
            <IsianTeks id="tnc-judul" nilai={t.judul} lebar={260} disabled={ro}
                       ubah={(v) => ubahT((x) => ({ ...x, judul: v }))} /></div>
        </div>
        <button className="pri" onClick={cetak}
                title={kt.cetakTncInfo}>
          {kt.cetakA4}</button>
      </div>
      {!ro && lain.length > 0 && (
        <div className="row" style={{ marginTop: 10, alignItems: "center" }}>
          <span className="lbl" style={{ margin: 0 }}>{kt.salinDari}</span>
          <select id="tnc-salin" value={dari} onChange={(e) => setDari(e.target.value)}>
            <option value="">{kt.pilih}</option>
            {lain.map((x) => <option key={x.slug} value={x.slug}>{kt.opsiProyek(x.nama, x.jumlah)}</option>)}
          </select>
          <button disabled={!dari} onClick={() => void salin()}>{kt.salin}</button>
        </div>
      )}
      {pesanSalin && <div className="banner info" style={{ marginTop: 8 }}>{pesanSalin}</div>}

      <h3 className="sub-judul">{kt.caraBayar}</h3>
      <div className="tnc-grid">
        {t.caraBayar.map((c, i) => (
          <div key={i} className="tnc-kartu">
            <div className="row" style={{ marginBottom: 6 }}>
              <b className="no">{i + 1}.</b>
              <IsianTeks nilai={c.judul} lebar={240} disabled={ro}
                         ubah={(v) => ubahCb(i, (x) => ({ ...x, judul: v }))} />
              {bolehUbah && <button className="kecil" onClick={() => ubahT((x) => ({
                ...x, caraBayar: x.caraBayar.filter((_, j) => j !== i) }))}>{kt.hapus}</button>}
            </div>
            <table className="tabel-ringkas tabel-isian"><tbody>
              {c.baris.map((b, j) => (
                <tr key={j}>
                  <td className="no">{String.fromCharCode(97 + j)}.</td>
                  <td><IsianTeks nilai={b.label} lebar={120} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, label: v } : y) }))} /></td>
                  <td><IsianTeks nilai={b.nilai} lebar={140} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, nilai: v } : y) }))} /></td>
                  <td><IsianTeks nilai={b.waktu} lebar={210} disabled={ro}
                                 ubah={(v) => ubahCb(i, (x) => ({ ...x, baris: x.baris.map((y, k) => k === j ? { ...y, waktu: v } : y) }))} /></td>
                  {bolehUbah && <td><button className="kecil" aria-label={kt.hapusBaris}
                    onClick={() => ubahCb(i, (x) => ({ ...x, baris: x.baris.filter((_, k) => k !== j) }))}>×</button></td>}
                </tr>
              ))}
            </tbody></table>
            <input value={c.catatan ?? ""} placeholder={kt.catatanOpsional} disabled={ro}
                   style={{ width: "100%", marginTop: 6 }}
                   onChange={(e) => ubahCb(i, (x) => ({ ...x, catatan: e.target.value || undefined }))} />
            {bolehUbah && <button className="kecil" style={{ marginTop: 6 }}
              onClick={() => ubahCb(i, (x) => ({ ...x, baris: [...x.baris, { label: "", nilai: "", waktu: "" }] }))}>
              {kt.tambahBaris}</button>}
          </div>
        ))}
      </div>
      {bolehUbah && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => ubahT((x) => ({ ...x,
            caraBayar: [...x.caraBayar, { judul: "", baris: [{ label: "Booking Fee", nilai: "10 Juta", waktu: "" }] }] }))}>
            {kt.tambahCb}</button>
          <button className="pri" disabled={denganTncLengkap(data) === data}
                  title={kt.buatSemuaInfo}
                  onClick={() => ubah(denganTncLengkap)}>
            {kt.buatSemua}</button>
          <button disabled={denganWaktuAwal(data) === data}
                  title={kt.isiWaktuInfo}
                  onClick={() => ubah(denganWaktuAwal)}>
            {kt.isiWaktu}</button>
          <span className="hint" style={{ margin: 0 }}>
            {denganTncLengkap(data) === data ? kt.semuaPunyaBlok
              : kt.belumBlok(denganTncLengkap(data).tnc.caraBayar.length - t.caraBayar.length)}
            {" "}{kt.awalInfo}
          </span>
        </div>
      )}

      <h3 className="sub-judul">{kt.catatan}</h3>
      <ol className="tnc-catatan">
        {t.catatan.map((c, i) => (
          <li key={i}><div className="tnc-baris">
            <TeksPanjang nilai={c} disabled={ro}
                         ubah={(v) => ubahT((x) => ({ ...x, catatan: x.catatan.map((y, j) => j === i ? v : y) }))} />
            {bolehUbah && <button className="kecil" onClick={() => ubahT((x) => ({
              ...x, catatan: x.catatan.filter((_, j) => j !== i) }))}>{kt.hapus}</button>}
          </div></li>
        ))}
      </ol>
      {bolehUbah && <button onClick={() => ubahT((x) => ({ ...x, catatan: [...x.catatan, ""] }))}>
        {kt.tambahCatatan}</button>}

      <h3 className="sub-judul">{kt.rekening}</h3>
      <input value={t.pengantarRekening} disabled={ro} style={{ width: "100%", maxWidth: 640 }}
             onChange={(e) => ubahT((x) => ({ ...x, pengantarRekening: e.target.value }))} />
      <div className="tscroll" style={{ marginTop: 8 }}>
        <table className="tabel-ringkas tabel-isian"><tbody>
          <tr><th>{kt.thBank}</th><th>{kt.thNoRek}</th><th>{kt.thCabang}</th>{bolehUbah && <th />}</tr>
          {t.rekening.map((r, i) => (
            <tr key={i}>
              {(["bank", "noRek", "cabang"] as const).map((f) => (
                <td key={f}><IsianTeks nilai={r[f]} lebar={190} disabled={ro}
                                       ubah={(v) => ubahT((x) => ({ ...x, rekening: x.rekening.map((y, j) => j === i ? { ...y, [f]: v } : y) }))} /></td>
              ))}
              {bolehUbah && <td><button className="kecil" onClick={() => ubahT((x) => ({
                ...x, rekening: x.rekening.filter((_, j) => j !== i) }))}>{kt.hapus}</button></td>}
            </tr>
          ))}
        </tbody></table>
      </div>
      {bolehUbah && <button style={{ marginTop: 8 }} onClick={() => ubahT((x) => ({ ...x,
        rekening: [...x.rekening, { bank: "", noRek: "", cabang: "" }] }))}>{kt.tambahRek}</button>}

      <LampiranTnc ro={ro} />
    </>
  );
}

/**
 * Lampiran gambar T&C — mis. tabel "Data konsumen yang harus dilengkapi" —
 * dicetak di halaman terakhir Term of Payment. Satu daftar untuk semua
 * project, dan langsung tersimpan (tidak menunggu Simpan draf).
 */
function LampiranTnc({ ro }: { ro: boolean }) {
  const kt = useKata(KATA);
  const [lampiran, setLampiran] = useState<{ id: string; nama: string }[]>([]);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/pricelist/tnc-lampiran").then((r) => r.ok ? r.json() : null)
      .then((b) => setLampiran(b?.lampiran ?? [])).catch(() => {});
  }, []);

  const simpan = async (ids: string[]) => {
    const r = await fetch("/api/pricelist/tnc-lampiran", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setGalat(b.detail ?? b.title ?? `HTTP ${r.status}`); return; }
    setLampiran(b.lampiran ?? []);
  };
  const unggah = async (files: File[]) => {
    const sisa = MAKS_GAMBAR - lampiran.length;
    if (!files.length) return;
    if (sisa <= 0) { setGalat(kt.maksLampiran(MAKS_GAMBAR)); return; }
    setSibuk(true); setGalat(null);
    try {
      const ids = lampiran.map((x) => x.id);
      for (const asli of files.slice(0, sisa)) {
        const f = await perkecilGambar(asli);
        const fd = new FormData(); fd.append("file", f, f.name);
        const res = await fetch("/api/pricelist/susun/gambar", { method: "POST", body: fd });
        const b = await res.json().catch(() => ({}));
        if (res.status === 401) { location.href = "/login"; return; }
        if (!res.ok) { setGalat(`${asli.name}: ${b.detail ?? b.title ?? `HTTP ${res.status}`}`); continue; }
        ids.push(b.id);
      }
      await simpan(ids);
    } finally {
      setSibuk(false);
    }
  };
  // Tempel screenshot (Windows + Shift + S lalu Ctrl + V) di kotak tempel.
  const tempel = (e: React.ClipboardEvent) => {
    if (ro) return;
    const files = [...e.clipboardData.items]
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it, i) => {
        const f = it.getAsFile()!;
        const jam = new Date().toLocaleString("sv-SE").replace(/[: ]/g, "-");
        return new File([f], `lampiran-${jam}${i ? `-${i + 1}` : ""}.${f.type.split("/")[1] || "png"}`,
                        { type: f.type });
      });
    e.preventDefault();
    if (files.length) void unggah(files);
  };
  const geser = (i: number, arah: -1 | 1) => {
    const ids = lampiran.map((x) => x.id);
    const j = i + arah;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void simpan(ids);
  };

  return (
    <>
      <h3 className="sub-judul">{kt.lampiranJudul}</h3>
      <p className="hint kiri" style={{ marginTop: 0 }}>
        {kt.lamp1} <b>{kt.lamp2}</b>{kt.lamp3}
      </p>
      {lampiran.length > 0 && (
        <div className="gambar-catatan">
          {lampiran.map((g, i) => (
            <figure key={g.id}>
              <a href={`/api/pricelist/tnc-lampiran/${g.id}`} target="_blank" rel="noreferrer"
                 title={kt.bukaGambar}>
                <img src={`/api/pricelist/tnc-lampiran/${g.id}`} alt={g.nama} loading="lazy" />
              </a>
              <figcaption>
                <span title={g.nama}>{i + 1}. {g.nama}</span>
                {!ro && (
                  <span className="row" style={{ margin: 0, gap: 4, flexWrap: "nowrap" }}>
                    <button className="kecil" disabled={i === 0} aria-label={kt.geserDepan}
                            onClick={() => geser(i, -1)}>▲</button>
                    <button className="kecil" disabled={i === lampiran.length - 1} aria-label={kt.geserBelakang}
                            onClick={() => geser(i, 1)}>▼</button>
                    <button className="kecil bahaya" aria-label={kt.hapusNama(g.nama)}
                            onClick={() => void simpan(lampiran.filter((x) => x.id !== g.id).map((x) => x.id))}>
                      {kt.hapus}</button>
                  </span>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {galat && <div className="banner stop" style={{ marginTop: 8 }}>{galat}</div>}
      {!ro && (
        <div className="row" style={{ margin: "6px 0 0", alignItems: "center" }}>
          <input id="tnc-tempel" readOnly value="" onPaste={tempel} style={{ width: 300 }}
                 placeholder={kt.tempelPh} />
          <label className="tombol-berkas">
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                   disabled={sibuk || lampiran.length >= MAKS_GAMBAR}
                   onChange={(e) => { void unggah([...(e.target.files ?? [])]); e.target.value = ""; }} />
            {sibuk ? kt.mengunggah : kt.tambahGambar}
          </label>
        </div>
      )}
    </>
  );
}

/** Kotak teks yang tingginya mengikuti isinya. */
function TeksPanjang({ nilai, ubah, disabled }: {
  nilai: string; ubah: (s: string) => void; disabled?: boolean;
}) {
  const [baris, setBaris] = useState(2);
  useEffect(() => {
    setBaris(Math.min(10, Math.max(2, Math.ceil(nilai.length / 110) + nilai.split("\n").length - 1)));
  }, [nilai]);
  return <textarea value={nilai} rows={baris} disabled={disabled}
                   onChange={(e) => ubah(e.target.value)} />;
}
