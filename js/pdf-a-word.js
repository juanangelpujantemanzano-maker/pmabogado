document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileNameEl = document.getElementById("fileName");
  var convertBtn = document.getElementById("convertBtn");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  var passwordBox = document.getElementById("passwordBox");
  var passwordInput = document.getElementById("passwordInput");
  var passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
  var passwordError = document.getElementById("passwordError");

  if (!dropZone) return; // not on this page

  var PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  var currentFile = null;
  var documentPassword = null;

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function hidePasswordBox() {
    passwordBox.style.display = "none";
    passwordError.style.display = "none";
    passwordInput.value = "";
  }

  function showPasswordBox(message) {
    passwordBox.style.display = "block";
    passwordError.style.display = message ? "block" : "none";
    passwordError.textContent = message || "";
    passwordInput.focus();
  }

  function showFile(file) {
    currentFile = file;
    documentPassword = null;
    fileNameEl.textContent = file.name;
    fileInfo.style.display = "flex";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("");
  }

  browseBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) showFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("drag-over");
    });
  });
  dropZone.addEventListener("drop", function (e) {
    var files = e.dataTransfer.files;
    if (files && files[0]) {
      if (files[0].type !== "application/pdf" && !/\.pdf$/i.test(files[0].name)) {
        setStatus("Por favor, selecciona un archivo PDF.", true);
        return;
      }
      showFile(files[0]);
    }
  });

  resetBtn.addEventListener("click", function () {
    currentFile = null;
    documentPassword = null;
    fileInput.value = "";
    fileInfo.style.display = "none";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("");
  });

  // ---------- Contraseña (pdf.js) ----------

  function askPdfPassword(isRetry) {
    return new Promise(function (resolve, reject) {
      showPasswordBox(isRetry ? "Contraseña incorrecta. Inténtalo de nuevo." : null);

      function onSubmit() {
        var val = passwordInput.value;
        if (!val) return;
        cleanup();
        resolve(val);
      }
      function cleanup() {
        passwordSubmitBtn.removeEventListener("click", onSubmit);
      }
      passwordSubmitBtn.addEventListener("click", onSubmit);
    });
  }

  function loadPdfJsWithPassword(bytes) {
    return new Promise(function (resolve, reject) {
      var loadingTask = pdfjsLib.getDocument({ data: bytes });
      loadingTask.onPassword = function (callback, reason) {
        var isRetry = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
        askPdfPassword(isRetry).then(function (pw) {
          documentPassword = pw;
          callback(pw);
        }).catch(function () {
          loadingTask.destroy();
        });
      };
      loadingTask.promise.then(resolve, reject);
    });
  }

  // ---------- Extracción de texto ----------

  // Detecta líneas que son casi con toda seguridad numeración de página u
  // otro texto de cabecera/pie repetitivo (por ejemplo "3", "Página 3 de 12",
  // "3/12", "- 3 -"), para descartarlas: no aportan contenido y su posición,
  // aislada del resto del texto, es lo que provocaba saltos de párrafo o de
  // página espurios en el documento generado.
  var PAGE_NUMBER_PATTERNS = [
    /^\d{1,4}$/,
    /^p[aá]gina\s*\d+(\s*(de|\/)\s*\d+)?$/i,
    /^page\s*\d+(\s*(of|\/)\s*\d+)?$/i,
    /^\d+\s*\/\s*\d+$/,
    /^-\s*\d+\s*-$/
  ];
  function isPageNumberLine(text) {
    var t = text.trim();
    if (!t) return false;
    return PAGE_NUMBER_PATTERNS.some(function (re) { return re.test(t); });
  }

  // Agrupa los items de pdf.js en líneas, guardando la posición vertical
  // (coordenada Y) y la altura de cada línea, necesarias para distinguir
  // más adelante un simple salto de línea por ajuste de un salto de párrafo.
  // También marca si la línea cae en la franja superior o inferior de la
  // página (cabecera/pie), lo que se usa después para detectar y eliminar
  // textos repetidos en todas las páginas (encabezados tipo "JURISPRUDENCIA"
  // que, si no se filtran, aparecen incrustados en mitad de una frase que
  // continúa de una página a la siguiente).
  var EDGE_ZONE_RATIO = 0.12;
  function extractPageLinesWithPosition(textContent, pageHeight) {
    var lines = [];
    var current = "";
    var currentY = null;
    var currentHeight = 0;
    function pushLine() {
      if (current.trim() && !isPageNumberLine(current)) {
        var inEdgeZone = false;
        if (pageHeight && currentY !== null) {
          inEdgeZone = currentY > pageHeight * (1 - EDGE_ZONE_RATIO) || currentY < pageHeight * EDGE_ZONE_RATIO;
        }
        lines.push({ text: current, y: currentY, height: currentHeight, edgeZone: inEdgeZone });
      }
      current = "";
      currentY = null;
      currentHeight = 0;
    }
    textContent.items.forEach(function (item) {
      if (currentY === null) currentY = item.transform[5];
      current += item.str;
      if (item.height) currentHeight = Math.max(currentHeight, item.height);
      if (item.hasEOL) pushLine();
    });
    pushLine();
    return lines;
  }

  function normalizeForRepeatCheck(text) {
    return text.trim().replace(/\s+/g, " ").toLowerCase();
  }

  // Detecta líneas cortas situadas en la franja superior o inferior de la
  // página que se repiten prácticamente idénticas en varias páginas del
  // documento (cabeceras o pies de página tipo "JURISPRUDENCIA", nombre del
  // despacho, etc.) y las elimina de todas las páginas, ya que no son
  // contenido real y, si se dejan, cortan frases que continúan de una
  // página a la siguiente.
  function removeRepeatedHeadersFooters(rawPagesLines) {
    if (rawPagesLines.length < 2) return rawPagesLines;

    var counts = {};
    rawPagesLines.forEach(function (lines) {
      var seenOnThisPage = {};
      lines.forEach(function (line) {
        if (!line.edgeZone) return;
        var norm = normalizeForRepeatCheck(line.text);
        if (!norm || norm.length > 70 || seenOnThisPage[norm]) return;
        seenOnThisPage[norm] = true;
        counts[norm] = (counts[norm] || 0) + 1;
      });
    });

    var minRepeats = Math.max(2, Math.ceil(rawPagesLines.length * 0.5));
    var toRemove = {};
    Object.keys(counts).forEach(function (norm) {
      if (counts[norm] >= minRepeats) toRemove[norm] = true;
    });
    if (!Object.keys(toRemove).length) return rawPagesLines;

    return rawPagesLines.map(function (lines) {
      return lines.filter(function (line) { return !toRemove[normalizeForRepeatCheck(line.text)]; });
    });
  }

  // Termina en un signo que indica claramente el final de una frase u
  // oración (punto, cierre de interrogación/exclamación, dos puntos al
  // final de un título, etc.), incluyendo el caso en que ese signo va
  // seguido de una comilla o paréntesis de cierre.
  function endsSentence(text) {
    return /[.!?:;][»"'”\)\]]*$/.test(text.trim());
  }

  // Reconstruye párrafos a partir de la lista de líneas de TODO el
  // documento (no página a página), para poder unir una frase que empieza
  // al final de una página del PDF con su continuación al principio de la
  // página siguiente, exactamente igual que un editor de texto: el
  // documento se trata como un flujo continuo y no se fuerza ningún salto
  // de página que no exista realmente en el propio texto.
  //
  // Dos líneas consecutivas de una misma página se consideran parte del
  // mismo párrafo (se unen con un espacio) salvo que el salto vertical
  // entre ellas sea sensiblemente mayor que la altura de línea habitual.
  // Al cruzar de una página a la siguiente esa comparación de posición ya
  // no es válida (cada página tiene su propio sistema de coordenadas), así
  // que en ese punto se decide en su lugar según la puntuación: si la
  // última línea de la página anterior no termina en un signo de cierre de
  // frase, se entiende que el texto continúa y se une con la primera línea
  // de la página siguiente.
  //
  // Cada párrafo conserva también la altura de línea aproximada del PDF
  // original, que se usa después para fijar un tamaño de letra similar en
  // el Word: sin esto, Word usaría su tamaño de letra por defecto, más
  // grande que el del documento original, y el texto acabaría ocupando
  // casi el doble de páginas.
  function linesToParagraphs(pagesOfLines) {
    var paragraphs = [];
    var buffer = null;
    var bufferHeight = 0;
    var prevLine = null;

    function flush() {
      if (buffer && buffer.length) paragraphs.push({ text: buffer.join(" "), height: bufferHeight });
      buffer = null;
      bufferHeight = 0;
    }

    pagesOfLines.forEach(function (lines) {
      lines.forEach(function (curr) {
        var text = curr.text.trim();
        if (!text) return;

        if (!buffer) {
          buffer = [text];
          bufferHeight = curr.height || 0;
          prevLine = curr;
          return;
        }

        var samePage = prevLine.page === curr.page;
        var isNewParagraph;
        if (samePage) {
          var lineHeight = prevLine.height || curr.height || 12;
          var gap = (prevLine.y !== null && curr.y !== null) ? prevLine.y - curr.y : lineHeight;
          isNewParagraph = gap > lineHeight * 1.4;
        } else {
          isNewParagraph = endsSentence(prevLine.text);
        }

        if (isNewParagraph) {
          flush();
          buffer = [text];
          bufferHeight = curr.height || 0;
        } else {
          buffer.push(text);
          bufferHeight = Math.max(bufferHeight, curr.height || 0);
        }
        prevLine = curr;
      });
    });
    flush();
    return paragraphs;
  }

  async function extractAllPages(pdf, onProgress) {
    var rawPagesLines = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      onProgress("Extrayendo texto de la página " + i + " de " + pdf.numPages + "…");
      var page = await pdf.getPage(i);
      var textContent = await page.getTextContent();
      var pageHeight = page.view ? (page.view[3] - page.view[1]) : 0;
      var lines = extractPageLinesWithPosition(textContent, pageHeight);
      lines.forEach(function (line) { line.page = i; });
      rawPagesLines.push(lines);
    }
    rawPagesLines = removeRepeatedHeadersFooters(rawPagesLines);
    return linesToParagraphs(rawPagesLines);
  }

  // ---------- Generación del .docx ----------

  function escapeXml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  var DEFAULT_FONT_HALF_POINTS = 22; // 11pt, si no se detecta la altura real de la línea
  var MIN_FONT_HALF_POINTS = 14; // 7pt
  var MAX_FONT_HALF_POINTS = 32; // 16pt

  // Convierte la altura de línea del PDF (en puntos) al tamaño de letra en
  // semipuntos que usa OOXML. Sin esto, Word aplicaría su tamaño de letra
  // por defecto (más grande que el del documento original), y el texto
  // acabaría ocupando casi el doble de páginas, dando la falsa impresión de
  // saltos de página añadidos de más por la herramienta.
  function heightToFontHalfPoints(height) {
    if (!height) return DEFAULT_FONT_HALF_POINTS;
    var halfPoints = Math.round(height * 2);
    return Math.min(MAX_FONT_HALF_POINTS, Math.max(MIN_FONT_HALF_POINTS, halfPoints));
  }

  // Sin esta propiedad, Word aplica el espaciado por defecto de su estilo
  // "Normal" (separación extra entre párrafos e interlineado > 1) a cada
  // párrafo generado. Como aquí cada línea corta de un documento puede
  // convertirse en su propio párrafo, ese espaciado por defecto se acumula
  // rápidamente y desplaza el contenido a páginas adicionales no deseadas.
  // Se fija por eso un espaciado compacto y un interlineado sencillo.
  function paragraphPr(fontHalfPoints) {
    return '<w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' +
      '<w:rPr><w:sz w:val="' + fontHalfPoints + '"/></w:rPr></w:pPr>';
  }
  function runPr(fontHalfPoints) {
    return '<w:rPr><w:sz w:val="' + fontHalfPoints + '"/></w:rPr>';
  }

  // Documento como flujo continuo: no se inserta ningún salto de página
  // artificial entre las páginas del PDF original (igual que hacen los
  // conversores de texto habituales); es Word quien pagina el resultado de
  // forma natural según el tamaño de letra y el espacio disponible.
  function buildDocumentXml(paragraphs) {
    var body = "";
    if (!paragraphs.length) {
      body += "<w:p>" + paragraphPr(DEFAULT_FONT_HALF_POINTS) + "</w:p>";
    } else {
      paragraphs.forEach(function (para) {
        var sz = heightToFontHalfPoints(para.height);
        body += "<w:p>" + paragraphPr(sz) + "<w:r>" + runPr(sz) +
          '<w:t xml:space="preserve">' + escapeXml(para.text) + "</w:t></w:r></w:p>";
      });
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      "<w:body>" + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417"/></w:sectPr>' +
      "</w:body></w:document>";
  }

  async function buildDocxBlob(paragraphs) {
    if (typeof JSZip === "undefined") {
      throw new Error("No se pudo cargar la librería necesaria (JSZip). Comprueba tu conexión a internet e inténtalo de nuevo.");
    }
    var zip = new JSZip();

    zip.file("[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      "</Types>");

    zip.folder("_rels").file(".rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      "</Relationships>");

    var wordFolder = zip.folder("word");
    wordFolder.file("document.xml", buildDocumentXml(paragraphs));
    wordFolder.folder("_rels").file("document.xml.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');

    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
  }

  // ---------- Flujo principal ----------

  async function attemptConvert() {
    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Abriendo documento…");

    try {
      var arrayBuffer = await currentFile.arrayBuffer();
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      var pdf = await loadPdfJsWithPassword(new Uint8Array(arrayBuffer));

      var paragraphs = await extractAllPages(pdf, function (msg) { setStatus(msg); });
      var hasText = paragraphs.length > 0;

      setStatus("Generando documento Word…");
      var blob = await buildDocxBlob(paragraphs);
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + ".docx";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);

      if (!hasText) {
        setStatus("Aviso: no se ha encontrado texto seleccionable en el PDF (parece un documento escaneado). Prueba antes con la herramienta OCR.", true);
      } else {
        setStatus("");
      }

      hidePasswordBox();
      resultBox.style.display = "flex";
    } catch (err) {
      console.error(err);
      if (err && err.message === "cancelled") { setStatus(""); return; }
      setStatus("No se pudo convertir el archivo: " + (err && err.message ? err.message : "error desconocido") + ".", true);
    } finally {
      convertBtn.disabled = false;
    }
  }

  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    attemptConvert();
  });
});
