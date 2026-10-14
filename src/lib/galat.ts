/**
 * Galat alur kerja, berdiri sendiri di berkas daun.
 *
 * Dulu kelas ini tinggal di workflow.ts, dan semua yang perlu melemparnya ikut
 * menarik seluruh mesin alur kerja. Begitu mesin itu sendiri perlu memanggil
 * sesuatu yang melempar galat ini — pengingat lewat surel — lingkarannya
 * tertutup: workflow → pengingat → surel → workflow. Modul yang saling
 * menunggu seperti itu bukan galat ketik; di Node ia berakhir sebagai nilai
 * `undefined` pada salah satu sisinya, pada waktu jalan, di satu jalur yang
 * jarang dilewati.
 *
 * Satu kelas di satu berkas yang tidak mengimpor apa pun memutus lingkaran itu
 * untuk selamanya. workflow.ts tetap mengekspornya kembali, jadi tidak ada
 * pemanggil lama yang perlu diubah.
 */
export class WorkflowError extends Error {
  constructor(
    message: string,
    public code = "workflow_conflict",
    public status = 409,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}
