document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var statusEl = document.getElementById("status");
  var signArea = document.getElementById("signArea");
  var fileNameEl = document.getElementById("fileName");
  var addSignBtn = document.getElementById("addSignBtn");
  var generateBtn = document.getElementById("generateBtn");
  var pagesContainer = document.getElementById("pagesContainer");
  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  var signModal = document.getElementById("signModal");
  var signPad = document.getElementById("signPad");
  var clearSignBtn = document.getElementById("clearSignBtn");
  var cancelSignBtn = document.getElementById("cancelSignBtn");
  var confirmSignBtn = document.getElementById("confirmSignBtn");

  var passwordModal = document.getElementById("passwordModal");
  var passwordModalMsg = document.getElementById("passwordModalMsg");
  var pdfPasswordInput = document.getElementById("pdfPasswordInput");
  var pdfPasswordCancelBtn = document.getElementById("pdfPasswordCancelBtn");
  var pdfPasswordSubmitBtn = document.getElementById("pdfPasswordSubmitBtn");

  if (!dropZone || !signPad) return; // not on this page

  var PDFJS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  var PAGE_TARGET_WIDTH = 700; // ancho de render de cada página, en px

  var currentFile = null;
  var originalBytes = null; // Uint8Array del PDF original, sin modificar
  var documentPassword = null; // contraseña del documento, si la tiene (se reutiliza al generar el PDF final)
  var pageInfos = []; // { pdfWidth, pdfHeight, overlay, canvas }
  var placedStamps = []; // { el, pageIndex, dataURL }

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

  var placingMode = false;
  var pendingDataURL = null;

  var padCtx = null;
  var padDrawing = false;
  var padHasDrawn = false;

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function resetAll() {
    currentFile = null;
    originalBytes = null;
    documentPassword = null;
    pageInfos = [];
    placedStamps = [];
    placingMode = false;
    pendingDataURL = null;
    pagesContainer.innerHTML = "";
    signArea.style.display = "none";
    resultBox.style.display = "none";
    generateBtn.disabled = true;
    fileInput.value = "";
    setStatus("");
  }

  browseBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });
  ["dragleave", "drop"].forEach(function (evt) {
    dropZone.addEventListener(evt, function (e) {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });
  dropZone.addEventListener("drop", function (e) {
    var files = e.dataTransfer.files;
    if (files && files[0]) handleFile(files[0]);
  });

  function handleFile(file) {
    if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
      setStatus("Por favor, selecciona un archivo PDF.", true);
      return;
    }
    currentFile = file;
    documentPassword = null;
    resultBox.style.display = "none";
    setStatus("Cargando documento…");

    var reader = new FileReader();
    reader.onload = function () {
      originalBytes = new Uint8Array(reader.result);
      renderPages(originalBytes.slice()).catch(function (err) {
        if (err && err.message === "cancelled") {
          setStatus("");
          return;
        }
        console.error(err);
        setStatus("No se ha podido abrir el PDF. Comprueba que el archivo no esté dañado.", true);
      });
    };
    reader.onerror = function () {
      setStatus("No se ha podido leer el archivo.", true);
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPages(bytesForPreview) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
    pagesContainer.innerHTML = "";
    pageInfos = [];
    placedStamps = [];
    generateBtn.disabled = true;

    return loadPdfJsWithPassword(bytesForPreview).then(function (pdf) {
      fileNameEl.textContent = currentFile.name;
      signArea.style.display = "block";

      var pagePromise = Promise.resolve();
      var _loop = function (pageNum) {
        pagePromise = pagePromise.then(function () {
          return pdf.getPage(pageNum).then(function (page) {
            var baseViewport = page.getViewport({ scale: 1 });
            var scale = PAGE_TARGET_WIDTH / baseViewport.width;
            var viewport = page.getViewport({ scale: scale });

            var canvas = document.createElement("canvas");
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            var ctx = canvas.getContext("2d");

            return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
              var wrap = document.createElement("div");
              wrap.className = "page-wrap";
              wrap.style.width = canvas.width + "px";
              wrap.style.height = canvas.height + "px";
              wrap.appendChild(canvas);

              var overlay = document.createElement("div");
              overlay.className = "page-overlay";
              wrap.appendChild(overlay);

              var pageLabel = document.createElement("div");
              pageLabel.className = "page-label";
              pageLabel.textContent = "Página " + pageNum;
              wrap.appendChild(pageLabel);

              pagesContainer.appendChild(wrap);

              var idx = pageInfos.length;
              pageInfos.push({
                pdfWidth: baseViewport.width,
                pdfHeight: baseViewport.height,
                overlay: overlay
              });

              overlay.addEventListener("click", function (e) {
                if (!placingMode || !pendingDataURL) return;
                if (e.target !== overlay) return; // evita colocar al pulsar sobre una firma existente
                var rect = overlay.getBoundingClientRect();
                var x = e.clientX - rect.left;
                var y = e.clientY - rect.top;
                placeStamp(idx, overlay, pendingDataURL, x, y);
                exitPlacingMode();
              });
            });
          });
        });
      };

      for (var p = 1; p <= pdf.numPages; p++) _loop(p);

      return pagePromise.then(function () {
        setStatus("");
      });
    });
  }

  // ---------- Colocación y manipulación de firmas ----------

  function placeStamp(pageIndex, overlay, dataURL, clickX, clickY) {
    var img = document.createElement("img");
    img.className = "sign-stamp";
    img.src = dataURL;
    img.draggable = false;

    var handle = document.createElement("div");
    handle.className = "sign-stamp-resize";

    var del = document.createElement("button");
    del.type = "button";
    del.className = "sign-stamp-delete";
    del.textContent = "×";
    del.setAttribute("aria-label", "Eliminar firma");

    var stampWrap = document.createElement("div");
    stampWrap.className = "sign-stamp-wrap";
    stampWrap.appendChild(img);
    stampWrap.appendChild(handle);
    stampWrap.appendChild(del);
    overlay.appendChild(stampWrap);

    var record = { el: stampWrap, pageIndex: pageIndex, dataURL: dataURL };
    placedStamps.push(record);
    generateBtn.disabled = placedStamps.length === 0;

    img.onload = function () {
      var initialWidth = 150;
      var ratio = img.naturalHeight / img.naturalWidth;
      var initialHeight = initialWidth * ratio;
      var overlayRect = overlay.getBoundingClientRect();

      var left = clickX - initialWidth / 2;
      var top = clickY - initialHeight / 2;
      left = Math.max(0, Math.min(left, overlayRect.width - initialWidth));
      top = Math.max(0, Math.min(top, overlayRect.height - initialHeight));

      stampWrap.style.width = initialWidth + "px";
      stampWrap.style.height = initialHeight + "px";
      stampWrap.style.left = left + "px";
      stampWrap.style.top = top + "px";
    };

    del.addEventListener("click", function (e) {
      e.stopPropagation();
      overlay.removeChild(stampWrap);
      var i = placedStamps.indexOf(record);
      if (i > -1) placedStamps.splice(i, 1);
      generateBtn.disabled = placedStamps.length === 0;
    });

    // Arrastrar para mover
    stampWrap.addEventListener("pointerdown", function (e) {
      if (e.target === handle || e.target === del) return;
      e.stopPropagation();
      stampWrap.setPointerCapture(e.pointerId);
      var overlayRect = overlay.getBoundingClientRect();
      var startLeft = stampWrap.offsetLeft;
      var startTop = stampWrap.offsetTop;
      var startX = e.clientX;
      var startY = e.clientY;

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var dy = ev.clientY - startY;
        var w = stampWrap.offsetWidth;
        var h = stampWrap.offsetHeight;
        var newLeft = Math.max(0, Math.min(startLeft + dx, overlayRect.width - w));
        var newTop = Math.max(0, Math.min(startTop + dy, overlayRect.height - h));
        stampWrap.style.left = newLeft + "px";
        stampWrap.style.top = newTop + "px";
      }
      function onUp(ev) {
        stampWrap.releasePointerCapture(e.pointerId);
        stampWrap.removeEventListener("pointermove", onMove);
        stampWrap.removeEventListener("pointerup", onUp);
      }
      stampWrap.addEventListener("pointermove", onMove);
      stampWrap.addEventListener("pointerup", onUp);
    });

    // Redimensionar manteniendo proporción
    handle.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      var overlayRect = overlay.getBoundingClientRect();
      var startW = stampWrap.offsetWidth;
      var startX = e.clientX;
      var ratio = stampWrap.offsetHeight / stampWrap.offsetWidth;

      function onMove(ev) {
        var dx = ev.clientX - startX;
        var maxW = overlayRect.width - stampWrap.offsetLeft;
        var newW = Math.max(40, Math.min(startW + dx, maxW));
        stampWrap.style.width = newW + "px";
        stampWrap.style.height = (newW * ratio) + "px";
      }
      function onUp(ev) {
        handle.releasePointerCapture(e.pointerId);
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function enterPlacingMode(dataURL) {
    placingMode = true;
    pendingDataURL = dataURL;
    pagesContainer.classList.add("placing");
    setStatus("Haz clic o toca el documento en el lugar donde quieres colocar la firma.");
  }

  function exitPlacingMode() {
    placingMode = false;
    pendingDataURL = null;
    pagesContainer.classList.remove("placing");
    setStatus("");
  }

  // ---------- Modal de firma (pad de dibujo) ----------

  function setupPadCanvas() {
    var cssWidth = signPad.clientWidth || 480;
    var cssHeight = 220;
    var dpr = window.devicePixelRatio || 1;
    signPad.width = cssWidth * dpr;
    signPad.height = cssHeight * dpr;
    signPad.style.height = cssHeight + "px";
    padCtx = signPad.getContext("2d");
    padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    padCtx.lineWidth = 2.6;
    padCtx.lineCap = "round";
    padCtx.lineJoin = "round";
    padCtx.strokeStyle = "#0a2540";
    padHasDrawn = false;
    confirmSignBtn.disabled = true;
  }

  function padPos(e) {
    var rect = signPad.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  signPad.addEventListener("pointerdown", function (e) {
    padDrawing = true;
    signPad.setPointerCapture(e.pointerId);
    var pos = padPos(e);
    padCtx.beginPath();
    padCtx.moveTo(pos.x, pos.y);
  });
  signPad.addEventListener("pointermove", function (e) {
    if (!padDrawing) return;
    var pos = padPos(e);
    padCtx.lineTo(pos.x, pos.y);
    padCtx.stroke();
    if (!padHasDrawn) {
      padHasDrawn = true;
      confirmSignBtn.disabled = false;
    }
  });
  function stopPadDrawing() { padDrawing = false; }
  signPad.addEventListener("pointerup", stopPadDrawing);
  signPad.addEventListener("pointerleave", stopPadDrawing);
  signPad.addEventListener("pointercancel", stopPadDrawing);

  clearSignBtn.addEventListener("click", function () {
    padCtx.clearRect(0, 0, signPad.width, signPad.height);
    padHasDrawn = false;
    confirmSignBtn.disabled = true;
  });

  addSignBtn.addEventListener("click", function () {
    signModal.style.display = "flex";
    setupPadCanvas();
  });

  cancelSignBtn.addEventListener("click", function () {
    signModal.style.display = "none";
  });

  confirmSignBtn.addEventListener("click", function () {
    var trimmed = trimCanvas(signPad);
    if (!trimmed) {
      signModal.style.display = "none";
      return;
    }
    signModal.style.display = "none";
    enterPlacingMode(trimmed);
  });

  // Recorta los márgenes transparentes del pad para que la firma quede ajustada
  function trimCanvas(canvas) {
    var ctx = canvas.getContext("2d");
    var w = canvas.width, h = canvas.height;
    var data = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // nada dibujado

    var pad = 6;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);

    var outW = maxX - minX + 1;
    var outH = maxY - minY + 1;
    var out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    out.getContext("2d").drawImage(canvas, minX, minY, outW, outH, 0, 0, outW, outH);
    return out.toDataURL("image/png");
  }

  // ---------- Generar PDF firmado ----------

  function attemptGenerate() {
    generateBtn.disabled = true;
    setStatus("Generando documento firmado…");

    generatePdf().then(function (bytes) {
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      downloadLink.href = url;
      var baseName = currentFile.name.replace(/\.pdf$/i, "");
      downloadLink.download = "firmado-" + baseName + ".pdf";
      signArea.style.display = "none";
      resultBox.style.display = "flex";
      setStatus("");
    }).catch(function (err) {
      // El documento podría necesitar contraseña en este paso si pdf.js no
      // la pidió antes (por ejemplo, PDF cifrado con contraseña de usuario
      // vacía). Se reutiliza el mismo modal para pedirla y reintentar.
      if (PDFLib.EncryptedPDFError && err instanceof PDFLib.EncryptedPDFError) {
        askPdfPassword(false).then(function (pw) {
          documentPassword = pw;
          attemptGenerate();
        }).catch(function () {
          setStatus("");
          generateBtn.disabled = false;
        });
        return;
      }
      if (documentPassword && /password/i.test((err && err.message) || "")) {
        askPdfPassword(true).then(function (pw) {
          documentPassword = pw;
          attemptGenerate();
        }).catch(function () {
          setStatus("");
          generateBtn.disabled = false;
        });
        return;
      }
      console.error(err);
      setStatus("No se ha podido generar el documento firmado.", true);
      generateBtn.disabled = false;
    });
  }

  generateBtn.addEventListener("click", function () {
    if (!originalBytes || placedStamps.length === 0) return;
    attemptGenerate();
  });

  function dataURLToUint8Array(dataURL) {
    var base64 = dataURL.split(",")[1];
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function generatePdf() {
    var loadOpts = {};
    if (documentPassword) loadOpts.password = documentPassword;
    return PDFLib.PDFDocument.load(originalBytes.slice(), loadOpts).then(function (pdfDoc) {
      var pages = pdfDoc.getPages();
      var embedCache = {}; // dataURL -> embeddedImage (evita incrustar la misma firma varias veces)

      var chain = Promise.resolve();
      placedStamps.forEach(function (stamp) {
        chain = chain.then(function () {
          var embedPromise;
          if (embedCache[stamp.dataURL]) {
            embedPromise = Promise.resolve(embedCache[stamp.dataURL]);
          } else {
            embedPromise = pdfDoc.embedPng(dataURLToUint8Array(stamp.dataURL)).then(function (img) {
              embedCache[stamp.dataURL] = img;
              return img;
            });
          }
          return embedPromise.then(function (pngImage) {
            var info = pageInfos[stamp.pageIndex];
            var page = pages[stamp.pageIndex];
            var overlayRect = info.overlay.getBoundingClientRect();
            var scaleX = info.pdfWidth / overlayRect.width;
            var scaleY = info.pdfHeight / overlayRect.height;

            var leftPx = stamp.el.offsetLeft;
            var topPx = stamp.el.offsetTop;
            var wPx = stamp.el.offsetWidth;
            var hPx = stamp.el.offsetHeight;

            var pdfWidth = wPx * scaleX;
            var pdfHeight = hPx * scaleY;
            var pdfX = leftPx * scaleX;
            var pdfY = info.pdfHeight - (topPx * scaleY) - pdfHeight;

            page.drawImage(pngImage, { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight });
          });
        });
      });

      return chain.then(function () {
        return pdfDoc.save();
      });
    });
  }

  resetBtn.addEventListener("click", resetAll);
});
