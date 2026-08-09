document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileNameEl = document.getElementById("fileName");
  var statusEl = document.getElementById("status");

  var passwordBox = document.getElementById("passwordBox");
  var passwordInput = document.getElementById("passwordInput");
  var passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
  var passwordError = document.getElementById("passwordError");

  var deleteArea = document.getElementById("deleteArea");
  var selectionNote = document.getElementById("selectionNote");
  var pageGrid = document.getElementById("pageGrid");
  var generateBtn = document.getElementById("generateBtn");

  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  if (!dropZone) return; // not on this page

  var PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var PAGE_TARGET_WIDTH = 260;

  var currentFile = null;
  var originalBytes = null;
  var documentPassword = null;
  var totalPages = 0;
  var selected = {}; // { pageIndex: true }

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

  function resetAll() {
    currentFile = null;
    originalBytes = null;
    documentPassword = null;
    totalPages = 0;
    selected = {};
    fileInput.value = "";
    fileInfo.style.display = "none";
    deleteArea.style.display = "none";
    resultBox.style.display = "none";
    pageGrid.innerHTML = "";
    hidePasswordBox();
    setStatus("");
  }

  function showFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setStatus("Por favor, selecciona un archivo PDF.", true);
      return;
    }
    currentFile = file;
    documentPassword = null;
    selected = {};
    fileNameEl.textContent = file.name;
    fileInfo.style.display = "flex";
    deleteArea.style.display = "none";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("Cargando documento…");

    file.arrayBuffer().then(function (buf) {
      originalBytes = new Uint8Array(buf);
      loadPdfJsWithPassword(originalBytes.slice()).then(renderThumbnails).catch(function (err) {
        if (err && err.message === "cancelled") { setStatus(""); return; }
        console.error(err);
        setStatus("No se ha podido abrir el PDF. Comprueba que el archivo no esté dañado.", true);
      });
    }).catch(function () {
      setStatus("No se ha podido leer el archivo.", true);
    });
  }

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
    if (files && files[0]) showFile(files[0]);
  });

  resetBtn.addEventListener("click", resetAll);

  // ---------- Miniaturas ----------

  function updateSelectionNote() {
    var count = Object.keys(selected).length;
    if (count === 0) {
      selectionNote.textContent = "Ninguna página seleccionada (de " + totalPages + ").";
    } else {
      selectionNote.textContent = count + " de " + totalPages + " páginas seleccionadas para eliminar.";
    }
    generateBtn.disabled = count === 0 || count >= totalPages;
    if (count >= totalPages && count > 0) {
      selectionNote.textContent += " No puedes eliminar todas las páginas del documento.";
    }
  }

  function renderThumbnails(pdf) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    pageGrid.innerHTML = "";
    selected = {};
    totalPages = pdf.numPages;

    var chain = Promise.resolve();
    var _loop = function (pageNum) {
      chain = chain.then(function () {
        return pdf.getPage(pageNum).then(function (page) {
          var baseViewport = page.getViewport({ scale: 1 });
          var scale = PAGE_TARGET_WIDTH / baseViewport.width;
          var viewport = page.getViewport({ scale: scale });

          var canvas = document.createElement("canvas");
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          var ctx = canvas.getContext("2d");

          return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
            var idx = pageNum - 1;

            var thumb = document.createElement("div");
            thumb.className = "page-thumb deletable";

            var badge = document.createElement("div");
            badge.className = "page-thumb-delete-badge";
            badge.innerHTML = "&#10003;";
            thumb.appendChild(badge);

            var canvasWrap = document.createElement("div");
            canvasWrap.className = "page-thumb-canvas-wrap";
            canvasWrap.appendChild(canvas);
            thumb.appendChild(canvasWrap);

            var label = document.createElement("div");
            label.className = "page-thumb-label";
            label.textContent = "Página " + pageNum;
            thumb.appendChild(label);

            thumb.addEventListener("click", function () {
              if (selected[idx]) {
                delete selected[idx];
                thumb.classList.remove("selected-for-delete");
              } else {
                selected[idx] = true;
                thumb.classList.add("selected-for-delete");
              }
              updateSelectionNote();
            });

            pageGrid.appendChild(thumb);
          });
        });
      });
    };
    for (var pageNum = 1; pageNum <= pdf.numPages; pageNum++) _loop(pageNum);

    return chain.then(function () {
      deleteArea.style.display = "block";
      updateSelectionNote();
      hidePasswordBox();
      setStatus("");
    });
  }

  // ---------- Generación del PDF resultante ----------

  async function generateResult() {
    var indices = Object.keys(selected).map(Number).sort(function (a, b) { return a - b; });
    if (!indices.length || indices.length >= totalPages) return;

    generateBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Generando documento…");

    try {
      var PDFLib = window.PDFLib;
      var loadOpts = {};
      if (documentPassword) loadOpts.password = documentPassword;
      var pdfDoc = await PDFLib.PDFDocument.load(originalBytes, loadOpts);

      // Eliminar de mayor a menor índice para no desplazar las posiciones.
      for (var i = indices.length - 1; i >= 0; i--) {
        pdfDoc.removePage(indices[i]);
      }

      var bytes = await pdfDoc.save();
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + "_editado.pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo generar el archivo: " + (err && err.message ? err.message : "error desconocido") + ".", true);
    } finally {
      generateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener("click", generateResult);
});
