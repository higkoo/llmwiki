import { pdfjs } from 'react-pdf'

const PDF_WORKER_SRC = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export function ensurePdfWorker(): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc !== PDF_WORKER_SRC) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC
  }
}

ensurePdfWorker()

export { pdfjs, PDF_WORKER_SRC }
