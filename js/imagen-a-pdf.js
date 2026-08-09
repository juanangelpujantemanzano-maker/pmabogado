document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileListEl = document.getElementById("fileList");
  var fileCountEl = document.getElementById("fileCount");
  var convertBtn = document.getElementById("convertBtn");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  if (!dropZone) return; // not on this page

  var currentFiles = [];

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function isImageFile(file) {
    if (file.type === "image/jpeg" || file.type === "image/png") return true;
    return /\.(jpe?g|png)$/i.test(file.name);
  }

  function renderFileList() {
    fileListEl.innerHTML = "";
    currentFiles.forEach(function (file, idx) {
      var li = document.createElement("li");
      var span = document.createElement("span");
      span.textContent = (idx + 1) + ". " + file.name;
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Quitar " + file.name);
      removeBtn.innerHTML = "&times;";
      removeBtn.addEventListener("click", function () {
        currentFiles.splice(idx, 1);
        if (currentFiles.length) {
          renderFileList();
        } else {
          fileInfo.style.display = "none";
        }
      });
      li.appendChild(span);
      li.appendChild(removeBtn);
      fileListEl.appendChild(li);
    });
    fileCountEl.textContent = currentFiles.length + (currentFiles.length === 1 ? " imagen" : " imágenes");
    fileInfo.style.display = "flex";
    resultBox.style.display = "none";
    setStatus("");
  }

  // Añade archivos nuevos a la lista existente, en vez de sustituirla: así se
  // pueden ir soltando de uno en uno o todos a la vez y se van acumulando.
  function addFiles(files) {
    var valid = Array.prototype.filter.call(files, isImageFile);
    if (!valid.length) {
      setStatus("Por favor, selecciona archivos JPG o PNG.", true);
      return;
    }
    currentFiles = currentFiles.concat(valid);
    renderFileList();
  }

  browseBtn.addEventListener("click", function () { fileInput.click(); });

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files.length) {
      addFiles(fileInput.files);
      fileInput.value = ""; // permite volver a seleccionar el mismo archivo más tarde
    }
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
    if (files && files.length) addFiles(files);
  });

  resetBtn.addEventListener("click", function () {
    currentFiles = [];
    fileInput.value = "";
    fileInfo.style.display = "none";
    resultBox.style.display = "none";
    setStatus("");
  });

  function detectImageKind(bytes) {
    // Comprueba la firma binaria en vez de fiarse solo de la extensión/MIME.
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
    return null;
  }

  async function imagesToPdf(files, onProgress) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      throw new Error("No se pudo cargar la librería de conversión (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.");
    }

    var pdfDoc = await PDFLib.PDFDocument.create();
    pdfDoc.setProducer("PM Abogado - Herramientas web (pdf-lib)");
    pdfDoc.setCreator("PM Abogado - Herramientas web");

    // 1px de imagen = 1/96 pulgada; 1 punto PDF = 1/72 pulgada.
    var PX_TO_PT = 72 / 96;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      onProgress("Añadiendo imagen " + (i + 1) + " de " + files.length + "…");

      var arrayBuffer = await file.arrayBuffer();
      var bytes = new Uint8Array(arrayBuffer);
      var kind = detectImageKind(bytes);
      if (!kind) {
        console.warn("Se omite un archivo que no parece un JPG/PNG válido:", file.name);
        continue;
      }

      var image = kind === "jpg" ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes);
      var widthPts = image.width * PX_TO_PT;
      var heightPts = image.height * PX_TO_PT;

      var page = pdfDoc.addPage([widthPts, heightPts]);
      page.drawImage(image, { x: 0, y: 0, width: widthPts, height: heightPts });
    }

    if (pdfDoc.getPageCount() === 0) {
      throw new Error("Ninguno de los archivos seleccionados es una imagen JPG o PNG válida.");
    }

    var bytesOut = await pdfDoc.save();
    return bytesOut;
  }

  convertBtn.addEventListener("click", async function () {
    if (!currentFiles.length) return;
    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Preparando documento…");
    try {
      var bytes = await imagesToPdf(currentFiles, function (msg) { setStatus(msg); });
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = (currentFiles.length === 1
        ? currentFiles[0].name.replace(/\.[^.]+$/, "")
        : "imagenes") + ".pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo generar el PDF: " + (err && err.message ? err.message : "error desconocido") + ". Prueba con otras imágenes.", true);
    } finally {
      convertBtn.disabled = false;
    }
  });
});
