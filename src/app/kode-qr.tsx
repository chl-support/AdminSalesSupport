"use client";

/**
 * Kode QR sebuah tautan, digambar di peramban.
 *
 * Tautan tanda tangan dikirim ke ponsel orangnya, sementara yang membuka
 * layar ini duduk di depan komputer. Selama ini jalannya hanya dua: menyalin
 * alamatnya lalu menempelkannya ke WhatsApp, atau membacakan deretan huruf
 * acak sepanjang empat puluh karakter lewat telepon. Yang kedua tidak pernah
 * benar pada percobaan pertama.
 *
 * QR memotong keduanya: ponselnya diarahkan ke layar, dan tautannya terbuka.
 *
 * Digambar di peramban, bukan diminta ke server, karena tautannya memang sudah
 * ada di peramban — satu panggilan lagi hanya menambah tempat yang dapat
 * gagal. Pustakanya dimuat saat dibutuhkan (import dinamis) supaya ia tidak
 * ikut terbundel pada halaman yang tidak pernah menampilkan QR.
 *
 * Gagalnya tidak disembunyikan: alamat tautannya tetap tertulis di atas, dan
 * yang membacanya perlu tahu bahwa yang kosong itu memang gagal, bukan sedang
 * dimuat selamanya.
 */

import { useEffect, useState } from "react";

export function KodeQr({ nilai, ukuran = 150, keterangan, gagalTeks }: {
  nilai: string;
  ukuran?: number;
  keterangan?: string;
  gagalTeks?: string;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [gagal, setGagal] = useState(false);

  useEffect(() => {
    let batal = false;
    setPng(null); setGagal(false);
    (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        // Digambar dua kali ukuran tampilnya: QR yang dipindai dari layar
        // melewati kamera ponsel, dan piksel yang diperbesar peramban membuat
        // tepi kotaknya kabur justru pada jarak baca yang wajar.
        const url = await QRCode.toDataURL(nilai, {
          margin: 1, width: ukuran * 2, errorCorrectionLevel: "M",
        });
        if (!batal) setPng(url);
      } catch {
        if (!batal) setGagal(true);
      }
    })();
    return () => { batal = true; };
  }, [nilai, ukuran]);

  if (gagal) {
    return (
      <p className="hint" style={{ textAlign: "left", margin: "4px 0 0" }}>
        {gagalTeks ?? "Kode QR tidak dapat dibuat. Pakai alamat tautan di atas."}
      </p>
    );
  }

  return (
    <div className="kotak-qr">
      {/* Tempatnya dipesan sejak awal — tinggi yang melompat begitu gambarnya
          jadi menggeser tombol di bawahnya tepat saat orang hendak menekannya. */}
      <div className="bingkai-qr" style={{ width: ukuran, height: ukuran }}>
        {png && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={png} alt={keterangan ?? "Kode QR tautan"}
               width={ukuran} height={ukuran} />
        )}
      </div>
      {keterangan && <div className="ket-qr">{keterangan}</div>}
    </div>
  );
}
