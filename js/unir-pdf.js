document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileListEl = document.getElementById("fileList");
  var fileCountEl = document.getElementById("fileCount");
  var sharedPasswordBar = document.getElementById("sharedPasswordBar");
  var sharedPasswordInput = document.getElementById("sharedPasswordInput");
  var applySharedPasswordBtn = document.getElementById("applySharedPasswordBtn");
  var convertBtn = document.getElementById("convertBtn");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");

  if (!dropZone) return; // not on this page

  // Cada elemento: { file, bytes, needsPassword: null|true|false, password, error, checking }
  var currentFiles = [];

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function isPdfFile(file) {
    return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  }

  function anyNeedsPassword() {
    return currentFiles.some(function (f) { return f.needsPassword === true; });
  }

  function renderFileList() {
    fileListEl.innerHTML = "";
    currentFiles.forEach(function (item, idx) {
      var li = document.createElement("li");
      li.style.flexDirection = "column";
      li.style.alignItems = "stretch";

      var row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "12px";

      var span = document.createElement("span");
      span.textContent = (idx + 1) + ". " + item.file.name;

      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.setAttribute("aria-label", "Quitar " + item.file.name);
      removeBtn.innerHTML = "&times;";
      removeBtn.addEventListener("click", function () {
        currentFiles.splice(idx, 1);
        if (currentFiles.length) {
          renderFileList();
        } else {
          fileInfo.style.display = "none";
        }
      });

      row.appendChild(span);
      row.appendChild(removeBtn);
      li.appendChild(row);

      if (item.checking) {
        var checkingNote = document.createElement("div");
        checkingNote.className = "file-password-note";
        checkingNote.textContent = "Comprobando si tiene contraseña…";
        li.appendChild(checkingNote);
      } else if (item.needsPassword) {
        var pwRow = document.createElement("div");
        pwRow.className = "file-password-row";

        var badge = document.createElement("span");
        badge.className = "file-password-badge";
        badge.innerHTML = "&#128274; Con contraseña";
        pwRow.appendChild(badge);

        var pwInput = document.createElement("input");
        pwInput.type = "password";
        pwInput.placeholder = "Contraseña de este archivo";
        pwInput.autocomplete = "off";
        pwInput.value = item.password || "";
        pwInput.addEventListener("input", function () {
          item.password = pwInput.value;
          item.error = null;
        });
        pwRow.appendChild(pwInput);

        li.appendChild(pwRow);

        if (item.error) {
          var errEl = document.createElement("div");
          errEl.className = "file-password-error";
          errEl.textContent = item.error;
          li.appendChild(errEl);
        }
      }

      fileListEl.appendChild(li);
    });

    fileCountEl.textContent = currentFiles.length + (currentFiles.length === 1 ? " archivo" : " archivos");
    fileInfo.style.display = "flex";
    sharedPasswordBar.style.display = anyNeedsPassword() ? "flex" : "none";
    resultBox.style.display = "none";
    setStatus("");
  }

  // Comprueba en segundo plano si un archivo está protegido con contraseña,
  // sin bloquear la interfaz, y actualiza la lista cuando termina.
  function checkPassword(item) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) return;
    item.file.arrayBuffer().then(function (buf) {
      item.bytes = new Uint8Array(buf);
      return PDFLib.PDFDocument.load(item.bytes);
    }).then(function () {
      item.needsPassword = false;
      item.checking = false;
      renderFileList();
    }).catch(function (err) {
      item.checking = false;
      if (PDFLib.EncryptedPDFError && err instanceof PDFLib.EncryptedPDFError) {
        item.needsPassword = true;
      } else {
        // No es un problema de contraseña: se tratará como error al unir.
        item.needsPassword = false;
      }
      renderFileList();
    });
  }

  // Añade archivos nuevos a la lista existente, en vez de sustituirla: así se
  // pueden ir soltando de uno en uno o todos a la vez y se van acumulando.
  function addFiles(files) {
    var valid = Array.prototype.filter.call(files, isPdfFile);
    if (!valid.length) {
      setStatus("Por favor, selecciona archivos PDF.", true);
      return;
    }
    valid.forEach(function (file) {
      var item = { file: file, bytes: null, needsPassword: null, password: "", error: null, checking: true };
      currentFiles.push(item);
      checkPassword(item);
    });
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

  applySharedPasswordBtn.addEventListener("click", function () {
    var shared = sharedPasswordInput.value;
    if (!shared) return;
    currentFiles.forEach(function (item) {
      if (item.needsPassword) {
        item.password = shared;
        item.error = null;
      }
    });
    renderFileList();
  });

  resetBtn.addEventListener("click", function () {
    currentFiles = [];
    fileInput.value = "";
    sharedPasswordInput.value = "";
    fileInfo.style.display = "none";
    resultBox.style.display = "none";
    setStatus("");
  });

  async function mergePdfs(items, onProgress) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      throw new Error("No se pudo cargar la librería de conversión (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.");
    }
    if (items.length < 2) {
      throw new Error("Añade al menos dos archivos PDF para unir.");
    }

    var mergedDoc = await PDFLib.PDFDocument.create();
    mergedDoc.setProducer("PM Abogado - Herramientas web (pdf-lib)");
    mergedDoc.setCreator("PM Abogado - Herramientas web");

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      onProgress("Añadiendo " + item.file.name + " (" + (i + 1) + " de " + items.length + ")…");

      if (!item.bytes) {
        item.bytes = new Uint8Array(await item.file.arrayBuffer());
      }

      var donorDoc;
      try {
        var loadOpts = item.needsPassword ? { password: item.password } : {};
        donorDoc = await PDFLib.PDFDocument.load(item.bytes, loadOpts);
      } catch (loadErr) {
        if (item.needsPassword) {
          item.error = "Contraseña incorrecta.";
          renderFileList();
          throw new Error("La contraseña introducida para «" + item.file.name + "» no es correcta.");
        }
        console.warn("No se pudo leer un archivo, se omite:", item.file.name, loadErr);
        continue;
      }

      var pageIndices = donorDoc.getPageIndices();
      var copiedPages = await mergedDoc.copyPages(donorDoc, pageIndices);
      copiedPages.forEach(function (page) { mergedDoc.addPage(page); });
    }

    if (mergedDoc.getPageCount() === 0) {
      throw new Error("Ninguno de los archivos seleccionados pudo unirse. Comprueba que sean PDF válidos.");
    }

    var bytes = await mergedDoc.save();
    return bytes;
  }

  convertBtn.addEventListener("click", async function () {
    if (!currentFiles.length) return;

    var missingPassword = currentFiles.find(function (f) { return f.needsPassword && !f.password; });
    if (missingPassword) {
      setStatus("Introduce la contraseña de «" + missingPassword.file.name + "» antes de continuar.", true);
      return;
    }

    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Preparando documento…");
    try {
      var bytes = await mergePdfs(currentFiles, function (msg) { setStatus(msg); });
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.setAttribute("download", "documento_unido.pdf");
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus("No se pudo unir el PDF: " + (err && err.message ? err.message : "error desconocido") + ".", true);
    } finally {
      convertBtn.disabled = false;
    }
  });
});
