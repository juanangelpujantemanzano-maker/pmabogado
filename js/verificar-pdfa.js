document.addEventListener("DOMContentLoaded", function () {
  var dropZone = document.getElementById("dropZone");
  var fileInput = document.getElementById("fileInput");
  var browseBtn = document.getElementById("browseBtn");
  var fileInfo = document.getElementById("fileInfo");
  var fileNameEl = document.getElementById("fileName");
  var verifyBtn = document.getElementById("verifyBtn");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var resultIcon = document.getElementById("resultIcon");
  var resultTitle = document.getElementById("resultTitle");
  var resultMessage = document.getElementById("resultMessage");
  var resultDetails = document.getElementById("resultDetails");
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

  var ANEXO_IV_MSG =
    "Este documento no cumple con lo establecido en el apartado 5º del Anexo IV del Real Decreto 1065/2015, de 27 de noviembre, sobre comunicaciones electrónicas en la Administración de Justicia en el ámbito territorial del Ministerio de Justicia y por el que se regula el sistema LexNET.";

  var ISO_BY_PART = {
    "1": "ISO 19005-1:2005",
    "2": "ISO 19005-2:2011",
    "3": "ISO 19005-3:2012",
    "4": "ISO 19005-4:2020"
  };

  var CONFORMANCE_LABEL = {
    "A": "Nivel A (Accesible)",
    "B": "Nivel B (Básico)",
    "U": "Nivel U (Unicode)",
    "E": "Nivel E (Ingeniería)",
    "F": "Nivel F (Archivos adjuntos)"
  };

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

  // ---------- Utilidades de bajo nivel ----------

  async function inflateFlate(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("no-decompression-stream");
    }
    var ds = new DecompressionStream("deflate");
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function nameValue(nameObj) {
    if (!nameObj) return null;
    try {
      var s = nameObj.asString ? nameObj.asString() : String(nameObj);
      return s.replace(/^\//, "");
    } catch (e) {
      return null;
    }
  }

  async function getMetadataXml(pdfDoc) {
    var PDFLib = window.PDFLib;
    var catalog = pdfDoc.catalog;
    var metaEntry = catalog.get(PDFLib.PDFName.of("Metadata"));
    if (!metaEntry) return null;

    var metaStream = pdfDoc.context.lookup(metaEntry);
    if (!metaStream || !metaStream.dict || !metaStream.contents) return null;

    var filter = metaStream.dict.get(PDFLib.PDFName.of("Filter"));
    var filterName = nameValue(filter);
    var raw = metaStream.contents;

    var bytes = raw;
    if (filterName === "FlateDecode") {
      try {
        bytes = await inflateFlate(raw);
      } catch (e) {
        return null; // no se puede descomprimir en este navegador
      }
    }

    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (e) {
      return null;
    }
  }

  function extractPdfaId(xml) {
    if (!xml) return null;

    var part =
      (xml.match(/<pdfaid:part[^>]*>\s*(\d)\s*<\/pdfaid:part>/i) || [])[1] ||
      (xml.match(/pdfaid:part\s*=\s*["'](\d)["']/i) || [])[1];

    var conformance =
      (xml.match(/<pdfaid:conformance[^>]*>\s*([A-Za-z])\s*<\/pdfaid:conformance>/i) || [])[1] ||
      (xml.match(/pdfaid:conformance\s*=\s*["']([A-Za-z])["']/i) || [])[1];

    if (!part) return null;
    return { part: part, conformance: conformance ? conformance.toUpperCase() : null };
  }

  function hasOutputIntentPdfA(pdfDoc) {
    try {
      var PDFLib = window.PDFLib;
      var catalog = pdfDoc.catalog;
      var oiEntry = catalog.get(PDFLib.PDFName.of("OutputIntents"));
      if (!oiEntry) return false;
      var oiArray = pdfDoc.context.lookup(oiEntry, PDFLib.PDFArray);
      if (!oiArray) return false;
      for (var i = 0; i < oiArray.size(); i++) {
        var oiDict = pdfDoc.context.lookup(oiArray.get(i), PDFLib.PDFDict);
        if (!oiDict) continue;
        var s = nameValue(oiDict.get(PDFLib.PDFName.of("S")));
        if (s && s.indexOf("GTS_PDFA") === 0) return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  // ---------- Presentación del resultado ----------

  function showConformResult(info, outputIntentPresent) {
    var type = "PDF/A-" + info.part + (info.conformance || "");
    var iso = ISO_BY_PART[info.part] || ("ISO 19005-" + info.part);
    var levelLabel = info.conformance ? (CONFORMANCE_LABEL[info.conformance] || info.conformance) : "No especificado";

    resultBox.className = "verify-result ok";
    resultIcon.textContent = "✅";
    resultTitle.textContent = "Documento conforme PDF/A";
    resultMessage.textContent = "El documento declara en sus metadatos conformidad con la norma PDF/A. Cumple con el requisito de formato PDF/A del apartado 5º del Anexo IV del Real Decreto 1065/2015, de 27 de noviembre, sobre comunicaciones electrónicas en la Administración de Justicia en el ámbito territorial del Ministerio de Justicia y por el que se regula el sistema LexNET.";

    resultDetails.innerHTML =
      "<dt>Tipo de PDF/A</dt><dd>" + type + "</dd>" +
      "<dt>Norma ISO</dt><dd>" + iso + "</dd>" +
      "<dt>Parte</dt><dd>Parte " + info.part + "</dd>" +
      "<dt>Nivel de conformidad</dt><dd>" + levelLabel + "</dd>" +
      "<dt>Perfil de color de salida (OutputIntent)</dt><dd>" + (outputIntentPresent ? "Presente" : "No detectado") + "</dd>";
    resultDetails.style.display = "grid";

    resultBox.style.display = "block";
  }

  function showNonConformResult(reasonNote) {
    resultBox.className = "verify-result fail";
    resultIcon.textContent = "❌";
    resultTitle.textContent = "Documento no conforme PDF/A";
    resultMessage.textContent = ANEXO_IV_MSG + (reasonNote ? " " + reasonNote : "");
    resultDetails.style.display = "none";
    resultDetails.innerHTML = "";
    resultBox.style.display = "block";
  }

  async function attemptVerify(password) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) {
      setStatus("No se pudo cargar la librería de verificación (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.", true);
      return;
    }

    verifyBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Analizando el documento…");

    try {
      var arrayBuffer = await currentFile.arrayBuffer();
      var loadOpts = { updateMetadata: false };
      if (password) loadOpts.password = password;
      var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, loadOpts);

      var xml = await getMetadataXml(pdfDoc);
      var info = extractPdfaId(xml);
      var outputIntentPresent = hasOutputIntentPdfA(pdfDoc);

      hidePasswordBox();
      setStatus("");
      if (info) {
        showConformResult(info, outputIntentPresent);
      } else {
        showNonConformResult(
          xml
            ? "El documento contiene metadatos, pero no declara conformidad PDF/A (no se han encontrado las etiquetas pdfaid:part / pdfaid:conformance)."
            : "El documento no contiene metadatos XMP de identificación PDF/A."
        );
      }
    } catch (err) {
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
      setStatus("No se pudo analizar el archivo: " + (err && err.message ? err.message : "error desconocido") + ". Comprueba que no esté dañado.", true);
    } finally {
      verifyBtn.disabled = false;
    }
  }

  verifyBtn.addEventListener("click", function () {
    if (!currentFile) return;
    attemptVerify(null);
  });

  passwordSubmitBtn.addEventListener("click", function () {
    var pw = passwordInput.value;
    if (!pw) return;
    attemptVerify(pw);
  });
});
