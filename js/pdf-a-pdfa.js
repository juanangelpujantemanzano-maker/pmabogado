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

  function buildXmp(title) {
    var now = new Date().toISOString();
    var safeTitle = (title || "Documento").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return (
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
      '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n' +
      '<pdfaid:part>3</pdfaid:part>\n' +
      '<pdfaid:conformance>B</pdfaid:conformance>\n' +
      '</rdf:Description>\n' +
      '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '<dc:format>application/pdf</dc:format>\n' +
      '<dc:title><rdf:Alt><rdf:li xml:lang="x-default">' + safeTitle + '</rdf:li></rdf:Alt></dc:title>\n' +
      '</rdf:Description>\n' +
      '<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n' +
      '<xmp:CreatorTool>PM Abogado - Herramientas web</xmp:CreatorTool>\n' +
      '<xmp:ModifyDate>' + now + '</xmp:ModifyDate>\n' +
      '<xmp:CreateDate>' + now + '</xmp:CreateDate>\n' +
      '</rdf:Description>\n' +
      '<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">\n' +
      '<pdf:Producer>PM Abogado - Herramientas web (pdf-lib)</pdf:Producer>\n' +
      '</rdf:Description>\n' +
      '</rdf:RDF>\n' +
      '</x:xmpmeta>\n' +
      '<?xpacket end="w"?>'
    );
  }

  // Genera un perfil ICC RGB mínimo (colorimetría estándar sRGB, formato ICC v2.1)
  // enteramente en el navegador, para poder incrustar un OutputIntent PDF/A válido
  // sin depender de ningún archivo externo.
  function buildSrgbIccProfile() {
    function u32(view, offset, val) { view.setUint32(offset, val >>> 0, false); }
    function s15Fixed16(view, offset, val) { view.setInt32(offset, Math.round(val * 65536), false); }
    function u16(view, offset, val) { view.setUint16(offset, val, false); }
    function asciiBytes(str) {
      var arr = new Uint8Array(str.length);
      for (var i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i) & 0xff;
      return arr;
    }
    function concatBytes(chunks) {
      var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
      var out = new Uint8Array(total);
      var off = 0;
      chunks.forEach(function (c) { out.set(c, off); off += c.length; });
      return out;
    }
    function pad4(bytes) {
      var rem = bytes.length % 4;
      if (rem === 0) return bytes;
      var out = new Uint8Array(bytes.length + (4 - rem));
      out.set(bytes, 0);
      return out;
    }
    function sig4(s) { return asciiBytes(s); }

    function xyzTag(x, y, z) {
      var buf = new Uint8Array(20);
      var dv = new DataView(buf.buffer);
      buf.set(sig4("XYZ "), 0);
      s15Fixed16(dv, 8, x); s15Fixed16(dv, 12, y); s15Fixed16(dv, 16, z);
      return pad4(buf);
    }
    function curveTagGamma(gamma) {
      var buf = new Uint8Array(14);
      var dv = new DataView(buf.buffer);
      buf.set(sig4("curv"), 0);
      u32(dv, 8, 1);
      u16(dv, 12, Math.round(gamma * 256));
      return pad4(buf);
    }
    function textTag(str) {
      var s = asciiBytes(str + "\0");
      var buf = new Uint8Array(8 + s.length);
      buf.set(sig4("text"), 0);
      buf.set(s, 8);
      return pad4(buf);
    }
    function textDescriptionTag(str) {
      var ascii = asciiBytes(str + "\0");
      var buf = new Uint8Array(8 + 4 + ascii.length + 8 + 70);
      var dv = new DataView(buf.buffer);
      buf.set(sig4("desc"), 0);
      u32(dv, 8, ascii.length);
      buf.set(ascii, 12);
      var off = 12 + ascii.length;
      u32(dv, off, 0); off += 4;
      u32(dv, off, 0); off += 4;
      return pad4(buf);
    }

    var tags = [
      ["desc", textDescriptionTag("sRGB (auto-generado)")],
      ["cprt", textTag("Perfil generico sRGB generado por PM Abogado - Herramientas web")],
      ["wtpt", xyzTag(0.9642, 1.0, 0.8249)],
      ["rXYZ", xyzTag(0.4360, 0.2225, 0.0139)],
      ["gXYZ", xyzTag(0.3851, 0.7169, 0.0971)],
      ["bXYZ", xyzTag(0.1431, 0.0606, 0.7139)],
      ["rTRC", curveTagGamma(2.2)],
      ["gTRC", curveTagGamma(2.2)],
      ["bTRC", curveTagGamma(2.2)]
    ];

    var tagCount = tags.length;
    var headerSize = 128;
    var tableSize = 4 + tagCount * 12;
    var offset = headerSize + tableSize;
    var entries = [];
    tags.forEach(function (t) {
      entries.push({ name: t[0], offset: offset, size: t[1].length });
      offset += t[1].length;
    });
    var totalSize = offset;

    var header = new Uint8Array(headerSize);
    var hv = new DataView(header.buffer);
    u32(hv, 0, totalSize);
    header.set(sig4("appl"), 4);
    u32(hv, 8, 0x02100000);
    header.set(sig4("mntr"), 12);
    header.set(sig4("RGB "), 16);
    header.set(sig4("XYZ "), 20);
    header.set(sig4("acsp"), 36);
    u32(hv, 64, 0);
    s15Fixed16(hv, 68, 0.9642);
    s15Fixed16(hv, 72, 1.0);
    s15Fixed16(hv, 76, 0.8249);
    header.set(sig4("PMAB"), 80);

    var table = new Uint8Array(tableSize);
    var tv = new DataView(table.buffer);
    u32(tv, 0, tagCount);
    entries.forEach(function (e, i) {
      var base = 4 + i * 12;
      table.set(sig4(e.name), base);
      u32(tv, base + 4, e.offset);
      u32(tv, base + 8, e.size);
    });

    var chunks = [header, table];
    tags.forEach(function (t) { chunks.push(t[1]); });
    return concatBytes(chunks);
  }

  async function convertToPdfA(file, password) {
    var PDFLib = window.PDFLib;
    if (!PDFLib) throw new Error("No se pudo cargar la librería de conversión (pdf-lib). Comprueba tu conexión a internet e inténtalo de nuevo.");

    var arrayBuffer = await file.arrayBuffer();
    var loadOpts = { updateMetadata: false };
    if (password) loadOpts.password = password;
    var pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, loadOpts);

    var title = file.name.replace(/\.pdf$/i, "");

    // Standard document info
    pdfDoc.setTitle(title);
    pdfDoc.setProducer("PM Abogado - Herramientas web (pdf-lib)");
    pdfDoc.setCreator("PM Abogado - Herramientas web");
    var now = new Date();
    pdfDoc.setCreationDate(now);
    pdfDoc.setModificationDate(now);

    // Attach XMP metadata declaring PDF/A-3B conformance
    try {
      var xmp = buildXmp(title);
      var xmpBytes = new TextEncoder().encode(xmp);
      var streamDict = pdfDoc.context.obj({
        Type: "Metadata",
        Subtype: "XML",
        Length: xmpBytes.length,
      });
      var metadataRef = pdfDoc.context.register(
        PDFLib.PDFRawStream.of(streamDict, xmpBytes)
      );
      pdfDoc.catalog.set(PDFLib.PDFName.of("Metadata"), metadataRef);
    } catch (metaErr) {
      // If low-level metadata embedding fails for some reason, continue —
      // the document info dictionary above still identifies the file.
      console.warn("No se pudieron incrustar los metadatos XMP:", metaErr);
    }

    // Incrustar un OutputIntent con perfil ICC sRGB (obligatorio en PDF/A cuando
    // el documento usa color dependiente de dispositivo, como DeviceRGB/DeviceGray).
    try {
      var iccBytes = buildSrgbIccProfile();
      var iccStreamDict = pdfDoc.context.obj({
        Length: iccBytes.length,
        N: 3,
        Alternate: "DeviceRGB",
      });
      var iccRef = pdfDoc.context.register(
        PDFLib.PDFRawStream.of(iccStreamDict, iccBytes)
      );
      var outputIntentDict = pdfDoc.context.obj({
        Type: "OutputIntent",
        S: "GTS_PDFA1",
        OutputConditionIdentifier: PDFLib.PDFString.of("sRGB IEC61966-2.1"),
        Info: PDFLib.PDFString.of("sRGB IEC61966-2.1"),
        DestOutputProfile: iccRef,
      });
      var outputIntentRef = pdfDoc.context.register(outputIntentDict);
      pdfDoc.catalog.set(
        PDFLib.PDFName.of("OutputIntents"),
        pdfDoc.context.obj([outputIntentRef])
      );
    } catch (oiErr) {
      console.warn("No se pudo incrustar el OutputIntent / perfil ICC:", oiErr);
    }

    // Asegurar que cada página tiene un grupo de transparencia (/Group) y que
    // todas las anotaciones tienen la clave /F, requisitos de PDF/A.
    try {
      var pages = pdfDoc.getPages();
      pages.forEach(function (page) {
        var node = page.node;
        if (!node.has(PDFLib.PDFName.of("Group"))) {
          var groupDict = pdfDoc.context.obj({
            Type: "Group",
            S: "Transparency",
            CS: "DeviceRGB",
          });
          node.set(PDFLib.PDFName.of("Group"), groupDict);
        }
        var annotsValue = node.get(PDFLib.PDFName.of("Annots"));
        if (annotsValue) {
          var annotsArray = pdfDoc.context.lookup(annotsValue, PDFLib.PDFArray);
          if (annotsArray) {
            for (var i = 0; i < annotsArray.size(); i++) {
              var annotDict = pdfDoc.context.lookup(annotsArray.get(i), PDFLib.PDFDict);
              if (annotDict && !annotDict.has(PDFLib.PDFName.of("F"))) {
                annotDict.set(PDFLib.PDFName.of("F"), PDFLib.PDFNumber.of(4));
              }
            }
          }
        }
      });
    } catch (pgErr) {
      console.warn("No se pudieron ajustar páginas/anotaciones para PDF/A:", pgErr);
    }

    var bytes = await pdfDoc.save();
    return bytes;
  }

  async function attemptConvert(password) {
    convertBtn.disabled = true;
    resultBox.style.display = "none";
    setStatus("Convirtiendo, un momento…");
    try {
      var bytes = await convertToPdfA(currentFile, password);
      var blob = new Blob([bytes], { type: "application/pdf" });
      var url = URL.createObjectURL(blob);
      var outName = currentFile.name.replace(/\.pdf$/i, "") + "_PDFA.pdf";
      downloadLink.href = url;
      downloadLink.setAttribute("download", outName);
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
      setStatus("No se pudo convertir el archivo: " + (err && err.message ? err.message : "error desconocido") + ". Prueba con otro PDF.", true);
    } finally {
      convertBtn.disabled = false;
    }
  }

  convertBtn.addEventListener("click", function () {
    if (!currentFile) return;
    attemptConvert(null);
  });

  passwordSubmitBtn.addEventListener("click", function () {
    var pw = passwordInput.value;
    if (!pw) return;
    attemptConvert(pw);
  });
});
