// Minimal types for pdfkit (there is no @types/pdfkit in the project),
// only what the report renderer needs is typed, the rest of the drawing API is loose
declare module 'pdfkit' {
  interface PDFDocumentOptions {
    size?: string | [number, number];
    margins?: { top: number; bottom: number; left: number; right: number };
    bufferPages?: boolean;
    autoFirstPage?: boolean;
    compress?: boolean;
    info?: Record<string, string | Date>;
  }

  class PDFDocument {
    constructor(options?: PDFDocumentOptions);
    page: {
      width: number;
      height: number;
      margins: { top: number; bottom: number; left: number; right: number };
    };
    x: number;
    y: number;
    info: Record<string, string | Date>;
    on(event: 'data', listener: (chunk: Buffer) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    bufferedPageRange(): { start: number; count: number };
    // the rest of the chainable drawing API (font, fontSize, fillColor, text, image, rect, ...)
    [method: string]: any;
  }

  export = PDFDocument;
}
