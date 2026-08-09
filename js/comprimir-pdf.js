document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileNameEl = document.getElementById("fileName");
  var convertBtn = document.getElementById("convertBtn");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var resultSummary = document.getElementById("resultSummary");
  var downloadLink = document.getElementById("downloadLink");
  var resetBtn = document.getElementById("resetBtn");
  var passwordBox = document.getElementById("passwordBox");
  var passwordInput = document.getElementById("passwordInput");
  var passwordSubmitBtn = document.getElementById("passwordSubmitBtn");
  var passwordError = document.getElementById("passwordError");

  if (!dropZone) return; // not on this page

  var currentFile = null;

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

  // Un solo nivel de compresión, sin opciones intermedias.
  var MAX_IMAGE_DIMENSION = 1600; // px, límite del lado más largo de cada imagen
  var JPEG_QUALITY = 0.6;

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
    fileInput.value = "";
    fileInfo.style.display = "none";
    resultBox.style.display = "none";
    hidePasswordBox();
    setStatus("");
  });

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  function dataUrlToUint8Array(dataUrl) {
    var base64 = dataUrl.split(",")[1];
    var binary = atob(base64);
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function loadImageFromBytes(bytes) {
    return new Promise(function (resolve, reject) {
      var blob = new Blob([bytes], { type: "image/jpeg" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function (err) {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  // Comprime bytes arbitrarios con el algoritmo Deflate/zlib nativo del
  // navegador (el mismo formato que usa el filtro FlateDecode de PDF), sin
  // depender de ninguna librería externa. Devuelve null si el navegador no
  // soporta la Compression Streams API (en cuyo caso esa parte se omite).
  async function deflateBytes(bytes) {
    if (typeof CompressionStream === "undefined") return null;
    var cs = new CompressionStream("deflate");
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var chunks = [];
    var total = 0;
    var reader = cs.readable.getReader();
    while (true) {
      var res = await reader.read();
      if (res.done) break;
      chunks.push(res.value);
      total += res.value.length;
    }
    var out = new Uint8Array(total);
    var offset = 0;
    chunks.forEach(function (c) { out.set(c, offset); offset += c.length; });
    return out;
  }

  async function recompressJpegImage(originalBytes) {
    var img = await loadImageFromBytes(originalBytes);
    var width = img.naturalWidth;
    var height = img.naturalHeight;
    if (!width || !height) throw new Error("No se pudieron leer las dimensiones de la imagen.");

    var scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
    var targetWidth = Math.max(1, Math.round(width * scale));
    var targetHeight = Math.max(1, Math.round(height * scale));

    var canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    var dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    var newBytes = dataUrlToUint8Array(dataUrl);
    return { bytes: newBytes, width: targetWidth, height: targetHeight };
  }

  async function compressPdf(file, password, onProgress) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      throw new Error("No se pudo cargar la librería de conversión (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.");
    }

    var originalSize = file.size;
    var arrayBuffer = await file.arrayBuffer();
    var loadOpts = { updateMetadata: false };
    if (password) loadOpts.password = password;
    var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, loadOpts);

    var entries = pdfDoc.context.enumerateIndirectObjects();
    var imageEntries = [];
    entries.forEach(function (entry) {
      var obj = entry[1];
      if (!(obj instanceof PDFLib.PDFRawStream)) return;
      var dict = obj.dict;
      var subtype = dict.get(PDFLib.PDFName.of("Subtype"));
      if (!subtype || subtype.toString() !== "/Image") return;
      var filter = dict.get(PDFLib.PDFName.of("Filter"));
      if (!filter || filter.toString() !== "/DCTDecode") return; // solo JPEG incrustado
      // Se omiten imágenes con máscara de transparencia (SMask/Mask), para no
      // arriesgar descuadres entre la imagen y su canal alfa al reescalarla.
      if (dict.has(PDFLib.PDFName.of("SMask")) || dict.has(PDFLib.PDFName.of("Mask"))) return;
      var colorSpace = dict.get(PDFLib.PDFName.of("ColorSpace"));
      var colorSpaceStr = colorSpace ? colorSpace.toString() : "";
      if (colorSpaceStr !== "/DeviceRGB" && colorSpaceStr !== "/DeviceGray" && colorSpaceStr !== "") return;
      imageEntries.push(obj);
    });

    var processed = 0;
    for (var i = 0; i < imageEntries.length; i++) {
      onProgress("Optimizando imagen " + (i + 1) + " de " + imageEntries.length + "…");
      var stream = imageEntries[i];
      try {
        var original = stream.contents;
        var result = await recompressJpegImage(original);
        if (result.bytes.length < original.length) {
          stream.contents = result.bytes;
          stream.dict.set(PDFLib.PDFName.of("Width"), PDFLib.PDFNumber.of(result.width));
          stream.dict.set(PDFLib.PDFName.of("Height"), PDFLib.PDFNumber.of(result.height));
          stream.dict.set(PDFLib.PDFName.of("ColorSpace"), PDFLib.PDFName.of("DeviceRGB"));
          stream.dict.set(PDFLib.PDFName.of("BitsPerComponent"), PDFLib.PDFNumber.of(8));
          processed++;
        }
      } catch (imgErr) {
        console.warn("No se pudo optimizar una imagen, se deja sin modificar:", imgErr);
      }
    }

    // Además de las imágenes, se comprime con Deflate/zlib (sin pérdida)
    // cualquier otro flujo del PDF que no esté ya comprimido: contenido de
    // las páginas, fuentes incrustadas, etc. Esto es lo que permite reducir
    // el peso de forma notable incluso en documentos de solo texto, ya que
    // muchos generadores de PDF sencillos no comprimen estos datos por
    // defecto. Al ser una compresión sin pérdida, el texto y el resto del
    // contenido quedan exactamente igual, solo cambia cómo se almacenan.
    var otherStreamsCompressed = 0;
    entries.forEach(function (entry) {
      var obj = entry[1];
      if (!(obj instanceof PDFLib.PDFRawStream)) return;
      if (imageEntries.indexOf(obj) !== -1) return; // ya tratado arriba
      var dict = obj.dict;
      if (dict.has(PDFLib.PDFName.of("Filter"))) return; // ya viene comprimido
      var type = dict.get(PDFLib.PDFName.of("Type"));
      if (type && (type.toString() === "/XRef" || type.toString() === "/ObjStm")) return;
      var original = obj.contents;
      if (!original || original.length < 64) return; // no compensa para flujos muy pequeños
      obj.__deflateCandidate = true;
    });

    var deflateSupported = typeof CompressionStream !== "undefined";
    if (deflateSupported) {
      for (var j = 0; j < entries.length; j++) {
        var candidateObj = entries[j][1];
        if (!candidateObj || !candidateObj.__deflateCandidate) continue;
        try {
          var originalBytes = candidateObj.contents;
          var compressed = await deflateBytes(originalBytes);
          if (compressed && compressed.length < originalBytes.length) {
            candidateObj.contents = compressed;
            candidateObj.dict.set(PDFLib.PDFName.of("Filter"), PDFLib.PDFName.of("FlateDecode"));
            otherStreamsCompressed++;
          }
        } catch (streamErr) {
          console.warn("No se pudo comprimir un flujo del documento, se deja sin modificar:", streamErr);
        }
      }
    }

    if (!imageEntries.length && otherStreamsCompressed === 0) {
      onProgress("El documento ya está optimizado: no se han encontrado imágenes ni contenido sin comprimir.");
    }

    var bytes = await pdfDoc.save({ useObjectStreams: true });
    return {
      bytes: bytes,
      originalSize: originalSize,
      processedImages: processed,
      totalImages: imageEntries.length,
      otherStreamsCompressed: otherStreamsCompressed,
    };
  }

  async function attemptCompress(password) {
    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Analizando documento…");
    try {
      var result = await compressPdf(currentFile, password, function (msg) { setStatus(msg); });
      var blob = new Blob([result.bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + "_comprimido.pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);

      var newSize = result.bytes.length;
      var reduction = result.originalSize > 0 ? (1 - newSize / result.originalSize) * 100 : 0;
      if (reduction > 1) {
        resultSummary.innerHTML = "&#9989; Compresión completada. Tamaño original: " + formatBytes(result.originalSize) +
          " → nuevo tamaño: " + formatBytes(newSize) + " (" + reduction.toFixed(0) + "% menos).";
      } else {
        resultSummary.innerHTML = "&#9989; Proceso completado. Este documento ya estaba optimizado (sin imágenes ni contenido sin comprimir que reducir), así que su tamaño apenas ha cambiado.";
      }

      hidePasswordBox();
      resultBox.style.display = "flex";
      setStatus("");
    } catch (err) {
      var PDFLib = window.PDFLib;
      var isEncryptedError = PDFLib && PDFLib.EncryptedPDFError && err instanceof PDFLib.EncryptedPDFError;
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
      setStatus("No se pudo comprimir el archivo: " + (err && err.message ? err.message : "error desconocido") + ". Prueba con otro PDF.", true);
    } finally {
      convertBtn.disabled = false;
    }
  }

  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    attemptCompress(null);
  });

  passwordSubmitBtn.addEventListener("click", function () {
    var pw = passwordInput.value;
    if (!pw) return;
    attemptCompress(pw);
  });
});
