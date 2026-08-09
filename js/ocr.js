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

  var passwordModal = document.getElementById("passwordModal");
  var passwordModalMsg = document.getElementById("passwordModalMsg");
  var pdfPasswordInput = document.getElementById("pdfPasswordInput");
  var pdfPasswordCancelBtn = document.getElementById("pdfPasswordCancelBtn");
  var pdfPasswordSubmitBtn = document.getElementById("pdfPasswordSubmitBtn");

  if (!dropZone) return; // not on this page

  var currentFile = null;

  // Ruta del worker de pdf.js en la misma versión clásica (UMD) cargada por <script>.
  var PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  // Escala de renderizado de página a imagen: cuanto mayor, más precisión de OCR
  // (y más lento). Al ser un único nivel "muy agresivo", usamos una escala alta fija.
  var RENDER_SCALE = 4;

  // Pide la contraseña del documento mediante un modal; se usa desde el
  // callback onPassword de pdf.js, que puede invocarse varias veces si la
  // contraseña introducida no es correcta.
  function askPdfPassword(isRetry) {
    return new Promise(function (resolve, reject) {
      passwordModalMsg.textContent = isRetry
        ? "La contraseña introducida no es correcta. Inténtalo de nuevo."
        : "Este PDF está protegido con contraseña. Introdúcela para continuar.";
      pdfPasswordInput.value = "";
      passwordModal.style.display = "flex";
      pdfPasswordInput.focus();

      function onSubmit() {
        var val = pdfPasswordInput.value;
        if (!val) return;
        cleanup();
        resolve(val);
      }
      function onCancel() {
        cleanup();
        reject(new Error("cancelled"));
      }
      function cleanup() {
        passwordModal.style.display = "none";
        pdfPasswordSubmitBtn.removeEventListener("click", onSubmit);
        pdfPasswordCancelBtn.removeEventListener("click", onCancel);
      }
      pdfPasswordSubmitBtn.addEventListener("click", onSubmit);
      pdfPasswordCancelBtn.addEventListener("click", onCancel);
    });
  }

  // Carga el documento con pdf.js, pidiendo la contraseña si el PDF está
  // protegido (y reintentando si el usuario se equivoca al escribirla).
  function loadPdfJsWithPassword(pdfjsLib, bytes) {
    return new Promise(function (resolve, reject) {
      var loadingTask = pdfjsLib.getDocument({ data: bytes });
      loadingTask.onPassword = function (callback, reason) {
        var isRetry = reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
        askPdfPassword(isRetry).then(function (pw) {
          callback(pw);
        }).catch(function () {
          loadingTask.destroy();
        });
      };
      loadingTask.promise.then(resolve, reject);
    });
  }

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function showFile(file) {
    currentFile = file;
    fileNameEl.textContent = file.name;
    fileInfo.style.display = "flex";
    resultBox.style.display = "none";
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
    fileInput.value = "";
    fileInfo.style.display = "none";
    resultBox.style.display = "none";
    setStatus("");
  });

  // Tesseract.js puede devolver las líneas ya "aplanadas" en result.data.lines,
  // o solo anidadas dentro de result.data.blocks[].paragraphs[].lines[] (según
  // versión/configuración). Se comprueban todas las rutas para no perder texto.
  function extractLines(data) {
    var direct = (data && data.lines) || [];
    if (direct.length) return direct;
    var fromBlocks = [];
    ((data && data.blocks) || []).forEach(function (block) {
      (block.paragraphs || []).forEach(function (p) {
        (p.lines || []).forEach(function (l) { fromBlocks.push(l); });
      });
    });
    if (fromBlocks.length) return fromBlocks;
    var fromParagraphs = [];
    ((data && data.paragraphs) || []).forEach(function (p) {
      (p.lines || []).forEach(function (l) { fromParagraphs.push(l); });
    });
    return fromParagraphs;
  }

  function dataUrlToUint8Array(dataUrl) {
    var base64 = dataUrl.split(",")[1];
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function renderPageToCanvas(pdfJsDoc, pageNum, scale) {
    var page = await pdfJsDoc.getPage(pageNum);
    var viewport = page.getViewport({ scale: scale });
    var basePageViewport = page.getViewport({ scale: 1 });
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    var ctx = canvas.getContext("2d", { alpha: false });
    // Importante: si la página del PDF no pinta un fondo propio (habitual en
    // documentos de texto simple sin imagen de fondo), el canvas queda
    // transparente detrás del texto. Al exportar a JPEG (que no admite
    // transparencia), los navegadores componen ese fondo transparente sobre
    // NEGRO por defecto, dejando el texto negro invisible sobre negro y
    // arruinando el OCR. Por eso pintamos el fondo en blanco explícitamente
    // antes de renderizar la página encima.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport, background: "#ffffff" }).promise;
    return {
      canvas: canvas,
      pageWidthPts: basePageViewport.width,
      pageHeightPts: basePageViewport.height,
    };
  }

  async function ocrPdf(file, onProgress) {
    var PDFLib = window.PDFLib;
    var pdfjsLib = window.pdfjsLib;
    var TesseractLib = window.Tesseract;

    if (!PDFLib || !pdfjsLib || !TesseractLib) {
      throw new Error("No se pudieron cargar las librerías necesarias (pdf-lib, pdf.js o Tesseract.js). Comprueba tu conexión a internet e inténtalo de nuevo.");
    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;

    var arrayBuffer = await file.arrayBuffer();
    var pdfJsDoc = await loadPdfJsWithPassword(pdfjsLib, new Uint8Array(arrayBuffer));
    var numPages = pdfJsDoc.numPages;

    var outDoc = await PDFLib.PDFDocument.create();
    outDoc.setTitle(file.name.replace(/\.pdf$/i, ""));
    outDoc.setProducer("PM Abogado - Herramientas web (pdf-lib + Tesseract.js)");
    outDoc.setCreator("PM Abogado - Herramientas web");

    var font = await outDoc.embedFont(PDFLib.StandardFonts.Helvetica);

    onProgress("Cargando motor de reconocimiento óptico…");
    // "spa+eng" para cubrir también términos, siglas o citas en inglés dentro
    // de documentos en español, y así detectar el máximo rango de caracteres.
    var worker = await TesseractLib.createWorker("spa+eng");
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: TesseractLib.PSM.AUTO,
        preserve_interword_spaces: "1",
      });
    } catch (paramErr) {
      console.warn("No se pudieron ajustar los parámetros de Tesseract:", paramErr);
    }

    try {
      for (var i = 1; i <= numPages; i++) {
        onProgress("Reconociendo texto: página " + i + " de " + numPages + "…");

        var rendered = await renderPageToCanvas(pdfJsDoc, i, RENDER_SCALE);
        var canvas = rendered.canvas;
        var pageWidthPts = rendered.pageWidthPts;
        var pageHeightPts = rendered.pageHeightPts;

        var jpgBytes = dataUrlToUint8Array(canvas.toDataURL("image/jpeg", 0.92));
        var jpgImage = await outDoc.embedJpg(jpgBytes);

        var newPage = outDoc.addPage([pageWidthPts, pageHeightPts]);
        newPage.drawImage(jpgImage, { x: 0, y: 0, width: pageWidthPts, height: pageHeightPts });

        // Importante: se pasa una imagen PNG (data URL) en vez del elemento
        // <canvas> directamente. Tesseract.js ejecuta el reconocimiento en un
        // Web Worker aparte, y en varios navegadores el envío del propio
        // elemento canvas al worker falla o no se serializa correctamente
        // (esto puede hacer que no se reconozca ningún carácter, sin dar
        // ningún error visible). Un PNG en base64 sí viaja de forma fiable.
        var lines = [];
        try {
          var pngDataUrl = canvas.toDataURL("image/png");
          var result = await worker.recognize(pngDataUrl);
          lines = extractLines(result && result.data);
        } catch (ocrErr) {
          console.error("Fallo el OCR en la página " + i + ":", ocrErr);
          onProgress("Aviso: no se pudo reconocer texto en la página " + i + ", se continúa con el resto…");
        }

        var scaleX = pageWidthPts / canvas.width;
        var scaleY = pageHeightPts / canvas.height;

        // Se coloca cada LÍNEA física detectada por el OCR (posición y ancho
        // reales, tal cual los midió Tesseract), igual que hacen las
        // herramientas de OCR profesionales: cada línea es un objeto de
        // texto independiente, alineado con exactitud sobre la imagen. Esto
        // hace que la selección con el ratón coincida siempre con lo que se
        // ve, incluidas las últimas palabras de cada renglón.
        //
        // Para que el ancho del texto invisible coincida con exactitud con
        // el ancho real de la línea detectada (y así no se quede corto ni se
        // pase, aunque la fuente estándar no sea idéntica a la del documento
        // original), el tamaño de letra se calcula a partir del ANCHO de la
        // línea en vez de su altura.
        lines.forEach(function (line) {
          var lineWords = (line.words && line.words.length)
            ? line.words
            : null;
          var text = lineWords
            ? lineWords.map(function (w) { return w.text; }).filter(function (t) { return t && t.trim(); }).join(" ")
            : (line.text || "").replace(/\s+$/, "");
          if (!text.trim()) return;

          var bbox = line.bbox;
          if (!bbox) return;
          var widthPts = (bbox.x1 - bbox.x0) * scaleX;
          var heightPts = (bbox.y1 - bbox.y0) * scaleY;
          if (widthPts <= 0 || heightPts <= 0) return;

          var fontSize;
          try {
            var unitWidth = font.widthOfTextAtSize(text, 1);
            fontSize = unitWidth > 0 ? widthPts / unitWidth : heightPts * 0.85;
          } catch (measureErr) {
            fontSize = heightPts * 0.85;
          }
          // Evita tamaños absurdos si la medición falla o el texto es muy corto.
          fontSize = Math.min(Math.max(fontSize, 0.05), heightPts * 3);

          var xPts = bbox.x0 * scaleX;
          var yPts = pageHeightPts - bbox.y1 * scaleY;
          if (yPts < 0) yPts = 0;

          try {
            newPage.drawText(text, {
              x: xPts,
              y: yPts,
              size: fontSize,
              font: font,
              opacity: 0, // capa de texto invisible: buscable/seleccionable pero no visible
            });
          } catch (lineErr) {
            // Si falla la línea completa (p.ej. algún carácter no soportado
            // por la fuente estándar), se reintenta palabra a palabra.
            var words = lineWords || [];
            var runningX = xPts;
            words.forEach(function (word) {
              if (!word.text || !word.text.trim()) return;
              try {
                newPage.drawText(word.text, {
                  x: runningX,
                  y: yPts,
                  size: fontSize,
                  font: font,
                  opacity: 0,
                });
                runningX += font.widthOfTextAtSize(word.text + " ", fontSize);
              } catch (wordErr) {
                // se omite la palabra problemática sin interrumpir el resto
              }
            });
          }
        });
      }
    } finally {
      await worker.terminate();
    }

    var bytes = await outDoc.save();
    return bytes;
  }

  convertBtn.addEventListener("click", async function () {
    if (!currentFile) return;
    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Preparando documento…");
    try {
      var bytes = await ocrPdf(currentFile, function (msg) { setStatus(msg); });
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + "_OCR.pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      if (err && err.message === "cancelled") {
        setStatus("");
        return;
      }
      console.error(err);
      setStatus("No se pudo procesar el archivo: " + (err && err.message ? err.message : "error desconocido") + ". Prueba con otro PDF.", true);
    } finally {
      convertBtn.disabled = false;
    }
  });
});
