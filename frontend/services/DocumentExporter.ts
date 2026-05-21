export const DocumentExporter = {
  /**
   * Export to CSV (Anki/Excel)
   */
  exportToCSV(filename: string, rows: string[][]) {
    const csvContent = rows
      .map(row => 
        row.map(cell => {
          const escaped = cell.replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Print to Academic PDF (uses print stylesheet)
   */
  exportToAcademicPDF(title: string, contentHtml: string) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            @media print {
              @page { margin: 2.54cm; }
              body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 2; text-align: justify; }
              h1, h2, h3 { font-family: "Times New Roman", Times, serif; font-weight: bold; margin-top: 24pt; margin-bottom: 12pt; }
              h1 { font-size: 18pt; text-align: center; }
              h2 { font-size: 14pt; }
              h3 { font-size: 12pt; }
            }
            body { font-family: "Times New Roman", Times, serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 2; text-align: justify; }
            h1 { text-align: center; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          ${contentHtml}
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  },

  /**
   * Export to MS Word (DOCX fallback via HTML mime type)
   */
  exportToWord(filename: string, title: string, contentHtml: string) {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>" + title + "</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + `<h1>${title}</h1>` + contentHtml + footer;

    const blob = new Blob(['\ufeff', sourceHTML], {
        type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  
  /**
   * Helper to parse flashcard string into an array of {front, back}
   */
  parseFlashcards(markdown: string): {front: string, back: string}[] {
    const cards: {front: string, back: string}[] = [];
    const blocks = markdown.split("---");
    
    for (const block of blocks) {
      if (!block.trim()) continue;
      const qMatch = block.match(/### Q:\s*(.+?)(?=\n### A:|$)/s);
      const aMatch = block.match(/### A:\s*(.+?)$/s);
      
      if (qMatch && aMatch) {
        cards.push({
          front: qMatch[1].trim(),
          back: aMatch[1].trim()
        });
      }
    }
    return cards;
  },
  
  /**
   * Helper to parse slides string into an array of {title, subtitle, content}
   */
  parseSlides(markdown: string): {title: string, content: string}[] {
    const slides: {title: string, content: string}[] = [];
    const blocks = markdown.split(/--- Slide \d+ ---/i);
    
    for (const block of blocks) {
      if (!block.trim()) continue;
      const titleMatch = block.match(/Title:\s*(.+)/i);
      const title = titleMatch ? titleMatch[1].trim() : "Slide";
      
      // Remove the Title line from content
      let content = block.replace(/Title:\s*(.+)/i, "").trim();
      slides.push({ title, content });
    }
    
    return slides;
  }
};
