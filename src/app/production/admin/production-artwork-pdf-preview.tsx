"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const PDF_OPTIONS = { withCredentials: true };

export default function ProductionArtworkPdfPreview({
  src,
  downloadUrl,
  zoom = 100,
}: {
  src: string;
  downloadUrl: string;
  zoom?: number;
}) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(720);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setPageWidth(Math.min(900, Math.max(180, Math.floor(entry.contentRect.width - 12))));
      }
    });
    observer.observe(viewer);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      aria-label="PDF artwork preview"
      className="production-artwork-pdf-preview"
    >
      <div className="production-artwork-pdf-canvas" ref={viewerRef}>
        <Document
          className="production-artwork-pdf-document"
          error={(
            <p className="production-artwork-pdf-error" role="alert">
              Could not render the PDF preview.{" "}
              <a download href={downloadUrl}>Download attached artwork</a>
            </p>
          )}
          file={src}
          loading={<p className="production-chart-empty" role="status">Loading PDF artwork…</p>}
          onLoadSuccess={({ numPages }) => {
            setPageCount(numPages);
            setPageNumber(1);
          }}
          options={PDF_OPTIONS}
          suspense={false}
        >
          {pageCount > 0 && (
            <Page
              pageNumber={pageNumber}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              scale={zoom / 100}
              width={pageWidth}
            />
          )}
        </Document>
      </div>
      {pageCount > 1 && (
        <nav aria-label="PDF pages" className="production-artwork-pdf-controls">
          <button
            aria-label="First PDF page"
            className="production-table-action"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber(1)}
            type="button"
          >
            First
          </button>
          <button
            aria-label="Previous PDF page"
            className="production-table-action"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((current) => current - 1)}
            type="button"
          >
            Previous
          </button>
          <span aria-live="polite">Page {pageNumber} of {pageCount}</span>
          <button
            aria-label="Next PDF page"
            className="production-table-action"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber((current) => current + 1)}
            type="button"
          >
            Next
          </button>
          <button
            aria-label="Last PDF page"
            className="production-table-action"
            disabled={pageNumber >= pageCount}
            onClick={() => setPageNumber(pageCount)}
            type="button"
          >
            Last
          </button>
        </nav>
      )}
    </div>
  );
}
