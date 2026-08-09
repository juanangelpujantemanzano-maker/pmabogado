document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileNameEl = document.getElementById("fileName");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  var passwordBox = document.getElementById("passwordBox");
  var passwordInput = document.getElementById("passwordInput");
  var passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
  var passwordError = document.getElementById("passwordError");

  var optionsBox = document.getElementById("optionsBox");
  var positionGrid = document.getElementById("positionGrid");
  var singlePageInput = document.getElementById("singlePageInput");
  var customPagesInput = document.getElementById("customPagesInput");
  var pageCountNote = document.getElementById("pageCountNote");
  var textFormatInput = document.getElementById("textFormatInput");
  var fontSizeInput = document.getElementById("fontSizeInput");
  var numberBtn = document.getElementById("numberBtn");

  if (!dropZone) return; // not on this page

  var currentFile = null;
  var originalBytes = null;
  var documentPassword = null;
  var totalPages = 0;
  var selectedPosition = "bottom-center";

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
    originalBytes = null;
    documentPassword = null;
    totalPages = 0;
    fileNameEl.textContent = file.name;
    fileInfo.style.display = "flex";
    optionsBox.style.display = "none";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("Analizando documento…");

    file.arrayBuffer().then(function (buf) {
      originalBytes = new Uint8Array(buf);
      attemptLoad(null);
    }).catch(function () {
      setStatus("No se ha podido leer el archivo.", true);
    });
  }

  function attemptLoad(password) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      setStatus("No se pudo cargar la librería necesaria (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.", true);
      return;
    }
    var loadOpts = {};
    if (password) loadOpts.password = password;

    PDFLib.PDFDocument.load(originalBytes, loadOpts).then(function (doc) {
      documentPassword = password || null;
      totalPages = doc.getPageCount();
      singlePageInput.max = totalPages;
      if (parseInt(singlePageInput.value, 10) > totalPages) singlePageInput.value = totalPages;
      pageCountNote.textContent = "Documento con " + totalPages + (totalPages === 1 ? " página." : " páginas.");
      hidePasswordBox();
      optionsBox.style.display = "block";
      setStatus("");
    }).catch(function (err) {
      var isEncryptedError = PDFLib.EncryptedPDFError && err instanceof PDFLib.EncryptedPDFError;
      var isWrongPassword = password && !isEncryptedError && /password/i.test((err && err.message) || "");
      if (isEncryptedError) {
        setStatus("");
        showPasswordBox(null);
        return;
      }
      if (isWrongPassword) {
        setStatus("");
        showPasswordBox("Contraseña incorrecta. Inténtalo de nuevo.");
        return;
      }
      console.error(err);
      setStatus("No se pudo leer el archivo: " + (err && err.message ? err.message : "error desconocido") + ".", true);
    });
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

  passwordSubmitBtn.addEventListener("click", function () {
    var pw = passwordInput.value;
    if (!pw) return;
    attemptLoad(pw);
  });

  resetBtn.addEventListener("click", function () {
    currentFile = null;
    originalBytes = null;
    documentPassword = null;
    totalPages = 0;
    fileInput.value = "";
    fileInfo.style.display = "none";
    optionsBox.style.display = "none";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("");
  });

  // ---------- Posición del número ----------

  positionGrid.querySelectorAll(".position-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      positionGrid.querySelectorAll(".position-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      selectedPosition = btn.getAttribute("data-position");
    });
  });

  // ---------- Selección de páginas ----------

  function updateRangeInputs() {
    var checked = document.querySelector('input[name="pageRange"]:checked');
    var val = checked ? checked.value : "all";
    singlePageInput.disabled = val !== "single";
    customPagesInput.disabled = val !== "custom";
  }
  document.querySelectorAll('input[name="pageRange"]').forEach(function (radio) {
    radio.addEventListener("change", updateRangeInputs);
  });

  function getSelectedPageIndices() {
    var checked = document.querySelector('input[name="pageRange"]:checked');
    var val = checked ? checked.value : "all";

    if (val === "all") {
      var arr = [];
      for (var i = 0; i < totalPages; i++) arr.push(i);
      return arr;
    }

    if (val === "single") {
      var n = parseInt(singlePageInput.value, 10);
      if (!n || n < 1 || n > totalPages) return null;
      return [n - 1];
    }

    // custom: p. ej. "1,3,5-8"
    var text = customPagesInput.value.trim();
    if (!text) return null;
    var set = {};
    text.split(",").forEach(function (token) {
      token = token.trim();
      if (!token) return;
      var rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        var a = parseInt(rangeMatch[1], 10);
        var b = parseInt(rangeMatch[2], 10);
        if (a > b) { var tmp = a; a = b; b = tmp; }
        for (var k = a; k <= b; k++) {
          if (k >= 1 && k <= totalPages) set[k - 1] = true;
        }
      } else {
        var single = parseInt(token, 10);
        if (single >= 1 && single <= totalPages) set[single - 1] = true;
      }
    });
    var indices = Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    return indices.length ? indices : null;
  }

  // ---------- Generación del PDF numerado ----------

  async function generateNumbered() {
    var indices = getSelectedPageIndices();
    if (!indices) {
      setStatus("Indica una selección de páginas válida.", true);
      return;
    }

    var textFormat = textFormatInput.value.trim() || "{n}";
    var fontSize = parseFloat(fontSizeInput.value);
    if (!fontSize || fontSize <= 0) fontSize = 11;
    fontSize = Math.min(Math.max(fontSize, 6), 48);

    numberBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Numerando documento…");

    try {
      var PDFLib = window.PDFLib;
      var loadOpts = {};
      if (documentPassword) loadOpts.password = documentPassword;
      var pdfDoc = await PDFLib.PDFDocument.load(originalBytes, loadOpts);
      var font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      var pages = pdfDoc.getPages();
      var margin = 28;

      indices.forEach(function (idx) {
        var page = pages[idx];
        if (!page) return;
        var text = textFormat
          .replace(/\{n\}/g, String(idx + 1))
          .replace(/\{total\}/g, String(totalPages));

        var pageWidth = page.getWidth();
        var pageHeight = page.getHeight();
        var textWidth = font.widthOfTextAtSize(text, fontSize);

        var x, y;
        switch (selectedPosition) {
          case "top-left":
            x = margin; y = pageHeight - margin - fontSize; break;
          case "top-center":
            x = (pageWidth - textWidth) / 2; y = pageHeight - margin - fontSize; break;
          case "top-right":
            x = pageWidth - margin - textWidth; y = pageHeight - margin - fontSize; break;
          case "bottom-left":
            x = margin; y = margin; break;
          case "bottom-right":
            x = pageWidth - margin - textWidth; y = margin; break;
          case "bottom-center":
          default:
            x = (pageWidth - textWidth) / 2; y = margin; break;
        }

        page.drawText(text, { x: x, y: y, size: fontSize, font: font });
      });

      var bytes = await pdfDoc.save();
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + "_numerado.pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo numerar el archivo: " + (err && err.message ? err.message : "error desconocido") + ".", true);
    } finally {
      numberBtn.disabled = false;
    }
  }

  numberBtn.addEventListener("click", generateNumbered);
});
