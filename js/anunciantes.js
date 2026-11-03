(function () {
  var CFG = window.ANUNCIOS;
  var HOY = new Date(); HOY.setHours(0, 0, 0, 0);
  function pd(s) { return s ? new Date(s + 'T00:00:00') : null; }
  function fd(s) { return pd(s).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
  function diasRest(a) { return Math.ceil((pd(a.hasta) - HOY) / 864e5); }
  /* los anuncios caducados dejan de mostrarse y sus bloques quedan libres */
  CFG.anunciantes = CFG.anunciantes.filter(function (a) { return !a.hasta || pd(a.hasta) >= HOY; });
  function esNuevo(a) { return a.desde && (HOY - pd(a.desde)) / 864e5 <= (CFG.diasNovedad || 30); }
  var COLS = CFG.cols, ROWS = CFG.rows, BS = 20;
  var W = COLS * BS, H = ROWS * BS;
  var eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var wrap = document.getElementById('globo');
  var tip = document.getElementById('globoTip');
  var modal = document.getElementById('ficha');
  var fichaBody = document.getElementById('fichaBody');
  var msg = document.getElementById('buscaMsg');
  var precioIva = CFG.precioBloque * (1 + CFG.iva / 100);
  var ROWS_SALE = CFG.filaMax - CFG.filaMin + 1;

  /* ---------- datos ---------- */
  var owner = [];
  for (var f = 0; f < ROWS; f++) { owner[f] = new Int16Array(COLS).fill(-1); }
  CFG.anunciantes.forEach(function (a, i) {
    a.bloques.forEach(function (b) {
      for (var y = b.f; y < b.f + b.h; y++) for (var x = b.c; x < b.c + b.w; x++) owner[y][x] = i;
    });
  });
  function forSale(c, f) { return c >= 0 && c < COLS && f >= CFG.filaMin && f <= CFG.filaMax; }

  /* ---------- textura (un único canvas) ---------- */
  var base = document.createElement('canvas'); base.width = W; base.height = H;
  var bctx = base.getContext('2d');
  function drawBase() {
    var g = bctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#06142b'); g.addColorStop(0.5, '#0d2a52'); g.addColorStop(1, '#06142b');
    bctx.fillStyle = g; bctx.fillRect(0, 0, W, H);
    bctx.fillStyle = 'rgba(255,255,255,0.06)';
    bctx.fillRect(0, CFG.filaMin * BS, W, ROWS_SALE * BS);
    bctx.strokeStyle = 'rgba(201,169,97,0.22)'; bctx.lineWidth = 1;
    bctx.beginPath();
    for (var c = 0; c <= COLS; c++) { bctx.moveTo(c * BS, CFG.filaMin * BS); bctx.lineTo(c * BS, (CFG.filaMax + 1) * BS); }
    for (var f = CFG.filaMin; f <= CFG.filaMax + 1; f++) { bctx.moveTo(0, f * BS); bctx.lineTo(W, f * BS); }
    bctx.stroke();
    CFG.anunciantes.forEach(function (a) {
      a.bloques.forEach(function (b) {
        var x = b.c * BS, y = b.f * BS, w = b.w * BS, h = b.h * BS;
        bctx.fillStyle = a.color; bctx.fillRect(x, y, w, h);
        if (a.imagen) return; /* las imágenes se dibujan aparte, a resolución completa */
        var ini = a.nombre.split(/\s+/).filter(function (p) { return /^[A-Za-zÁÉÍÓÚÑ]/.test(p); }).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase();
        bctx.fillStyle = 'rgba(255,255,255,0.92)';
        bctx.font = 'bold ' + Math.floor(Math.min(w, h) * 0.45) + 'px Arial';
        bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
        bctx.fillText(ini, x + w / 2, y + h / 2);
        bctx.strokeStyle = 'rgba(255,255,255,0.75)'; bctx.lineWidth = 2; bctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      });
    });
  }

  /* ---------- three ---------- */
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.z = 3.1;
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  wrap.appendChild(renderer.domElement);
  drawBase();
  var texture = new THREE.CanvasTexture(base);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  var globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ map: texture }));
  scene.add(globe);
  var glow = new THREE.Mesh(new THREE.SphereGeometry(1.03, 64, 48), new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.08, side: THREE.BackSide }));
  scene.add(glow);
  globe.rotation.set(0.25, 0.4, 0);
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: texture }));
  plane.visible = false; scene.add(plane);
  var flat = false, globeZ = 3.1;

  /* resaltado mediante mallas superpuestas (no se redibuja la textura) */
  var hlG = new THREE.Group(), hlP = new THREE.Group();
  globe.add(hlG); plane.add(hlP);
  var hlMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
  var hlLine = new THREE.LineBasicMaterial({ color: 0xffd36b });
  var hlOk = new THREE.MeshBasicMaterial({ color: 0x4be07a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  var hlOkLine = new THREE.LineBasicMaterial({ color: 0x4be07a });
  var hlBad = new THREE.MeshBasicMaterial({ color: 0xff5c5c, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  var hlBadLine = new THREE.LineBasicMaterial({ color: 0xff5c5c });
  /* satélites que orbitan el globo (pasan por delante y por detrás) */
  var sats = [];
  (function () {
    var cfgs = [[1.32, 0.9, 0.2, 0.55, 0], [1.45, -0.5, 1.4, -0.38, 2], [1.26, 0.2, 2.6, 0.7, 4], [1.55, 1.2, 0.6, -0.28, 1]];
    cfgs.forEach(function (c0) {
      var orbit = new THREE.Group(); orbit.rotation.set(c0[1], c0[2], 0); scene.add(orbit);
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      var halo = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7fb8ff, transparent: true, opacity: 0.35, depthWrite: false }));
      s.add(halo); orbit.add(s);
      var ring = new THREE.Mesh(new THREE.RingGeometry(c0[0] - 0.0015, c0[0] + 0.0015, 128), new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = Math.PI / 2; orbit.add(ring);
      sats.push({ orbit: orbit, s: s, r: c0[0], w: c0[3], a: c0[4], halo: halo });
    });
  })();

  /* destello en los anuncios nuevos */
  var nuevoMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  var nuevoG = new THREE.Group(), nuevoP = new THREE.Group();
  globe.add(nuevoG); plane.add(nuevoP);
  CFG.anunciantes.forEach(function (a) {
    if (!esNuevo(a)) return;
    a.bloques.forEach(function (b) {
      nuevoG.add(new THREE.Mesh(new THREE.SphereGeometry(1.006, Math.max(2, Math.min(24, b.w * 2)), Math.max(2, Math.min(24, b.h * 2)), (b.c / COLS) * 2 * Math.PI, (b.w / COLS) * 2 * Math.PI, (b.f / ROWS) * Math.PI, (b.h / ROWS) * Math.PI), nuevoMat));
      var pm = new THREE.Mesh(new THREE.PlaneGeometry(b.w / COLS * 4, b.h / ROWS * 2), nuevoMat);
      pm.position.set(((b.c + b.w / 2) / COLS - 0.5) * 4, (0.5 - (b.f + b.h / 2) / ROWS) * 2, 0.004);
      nuevoP.add(pm);
    });
  });

  /* imágenes de anunciantes como mallas con su propia textura (resolución completa, sin depender del canvas base) */
  var adG = new THREE.Group(), adP = new THREE.Group();
  globe.add(adG); plane.add(adP);
  CFG.anunciantes.forEach(function (a) {
    if (!a.imagen) return;
    var img = new Image();
    img.onload = function () {
      var tx = new THREE.Texture(img); tx.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); tx.minFilter = THREE.LinearMipmapLinearFilter; tx.magFilter = THREE.LinearFilter; tx.needsUpdate = true;
      a.bloques.forEach(function (b) {
        var sg = new THREE.SphereGeometry(1, Math.max(2, Math.min(24, b.w * 2)), Math.max(2, Math.min(24, b.h * 2)), (b.c / COLS) * 2 * Math.PI, (b.w / COLS) * 2 * Math.PI, (b.f / ROWS) * Math.PI, (b.h / ROWS) * Math.PI);
        adG.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
        var pg = new THREE.PlaneGeometry(b.w / COLS * 4, b.h / ROWS * 2);
        var pm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tx }));
        pm.position.set(((b.c + b.w / 2) / COLS - 0.5) * 4, (0.5 - (b.f + b.h / 2) / ROWS) * 2, 0.001);
        adP.add(pm);
      });
    };
    img.src = a.imagen;
  });
  function clearGroup(g) { while (g.children.length) { var m = g.children.pop(); m.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); } }
  function setHl(rects, kind) {
    clearGroup(hlG); clearGroup(hlP);
    if (!rects) return;
    var mat = kind === 'ok' ? hlOk : kind === 'bad' ? hlBad : hlMat, lmat = kind === 'ok' ? hlOkLine : kind === 'bad' ? hlBadLine : hlLine;
    rects.forEach(function (b) {
      var sw = Math.max(2, Math.min(24, Math.ceil(b.w / 3))), sh = Math.max(2, Math.min(24, Math.ceil(b.h / 3)));
      var geo = new THREE.SphereGeometry(1.004, sw, sh, (b.c / COLS) * 2 * Math.PI, (b.w / COLS) * 2 * Math.PI, (b.f / ROWS) * Math.PI, (b.h / ROWS) * Math.PI);
      var m = new THREE.Mesh(geo, mat);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), lmat));
      hlG.add(m);
      var pg = new THREE.PlaneGeometry(Math.max(b.w / COLS * 4, 0.02), Math.max(b.h / ROWS * 2, 0.02));
      var pm = new THREE.Mesh(pg, mat);
      pm.position.set(((b.c + b.w / 2) / COLS - 0.5) * 4, (0.5 - (b.f + b.h / 2) / ROWS) * 2, 0.003);
      pm.add(new THREE.LineSegments(new THREE.EdgesGeometry(pg), lmat));
      hlP.add(pm);
    });
  }

  function zFit() { var vt = Math.tan(camera.fov * Math.PI / 360); return Math.max(2 / (2 * vt), 4 / (2 * vt * camera.aspect)) * 1.02; }
  function zMin() { return flat ? 0.5 : 1.45; }
  function zMax() { return flat ? zFit() : 4.2; }
  function clampPan() {
    var vt = Math.tan(camera.fov * Math.PI / 360), hh = camera.position.z * vt, hw = hh * camera.aspect;
    var mx = Math.max(0, 2 - hw), my = Math.max(0, 1 - hh);
    camera.position.x = Math.max(-mx, Math.min(mx, camera.position.x));
    camera.position.y = Math.max(-my, Math.min(my, camera.position.y));
  }
  function resize() {
    var w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (flat) { camera.position.z = Math.min(camera.position.z, zFit()); clampPan(); }
  }
  window.addEventListener('resize', resize);

  var dragging = false, moved = 0, lx = 0, ly = 0, target = null, sticky = false, over = false;
  var btnVista = document.getElementById('vistaBtn');
  function setFlat(on) {
    flat = on; target = null;
    globe.visible = !on; glow.visible = !on; plane.visible = on;
    if (on) { globeZ = camera.position.z; camera.position.set(0, 0, zFit()); }
    else { camera.position.set(0, 0, globeZ); }
    btnVista.textContent = on ? '3D' : '2D';
    btnVista.setAttribute('aria-label', on ? 'Ver esfera' : 'Ver plano'); btnVista.title = on ? 'Ver esfera' : 'Ver plano';
    wrap.querySelector('.globo-aviso').textContent = on ? 'Arrastra para mover · rueda o botones para el zoom · pulsa un bloque para abrirlo' : 'Arrastra para girar · rueda o botones para el zoom · pulsa un bloque para abrirlo';
  }
  btnVista.onclick = function () { setFlat(!flat); };

  /* ---------- interacción ---------- */
  var ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function pick(ev) {
    var r = renderer.domElement.getBoundingClientRect();
    mouse.x = ((ev.clientX - r.left) / r.width) * 2 - 1; mouse.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(mouse, camera);
    var hit = ray.intersectObject(flat ? plane : globe)[0];
    if (!hit) return null;
    return { c: Math.min(COLS - 1, Math.floor(hit.uv.x * COLS)), f: Math.min(ROWS - 1, Math.floor((1 - hit.uv.y) * ROWS)) };
  }
  function label(c, f) { return (c + 1) + '-' + (f - CFG.filaMin + 1); }
  function describe(p) {
    if (!p) return null;
    if (!forSale(p.c, p.f)) return { txt: 'Zona no disponible', res: null };
    var o = owner[p.f][p.c];
    if (o >= 0) { var a = CFG.anunciantes[o]; return { txt: a.nombre + ' · ' + a.ciudad + (a.hasta ? ' · hasta ' + fd(a.hasta) : ''), res: a.bloques, a: a }; }
    return { txt: 'Bloque ' + label(p.c, p.f) + ' · Libre', res: [{ c: p.c, f: p.f, w: 1, h: 1 }], libre: p };
  }
  function placeTip(e) {
    var r = wrap.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    tip.style.display = 'block';
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = x + 14, top = y + 14;
    if (left + tw > r.width - 6) left = x - tw - 14;
    if (top + th > r.height - 6) top = y - th - 14;
    tip.style.left = Math.max(4, left) + 'px'; tip.style.top = Math.max(4, top) + 'px';
  }
  /* ---------- selección de grupos de bloques ---------- */
  var selMode = false, selDrag = false, selStart = null, selRect = null;
  var selInfo = document.getElementById('selInfo'), selBtn = document.getElementById('selBtn');
  function rectOf(a, b) {
    var f0 = Math.max(CFG.filaMin, Math.min(a.f, b.f)), f1 = Math.min(CFG.filaMax, Math.max(a.f, b.f));
    var c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
    return { c: c0, f: f0, w: c1 - c0 + 1, h: f1 - f0 + 1 };
  }
  function selFree(r) {
    for (var y = r.f; y < r.f + r.h; y++) for (var x = r.c; x < r.c + r.w; x++) if (!forSale(x, y) || owner[y][x] >= 0) return false;
    return true;
  }
  function money(n) { return eur.format(n); }
  function updateSel() {
    if (!selRect) { selInfo.style.display = 'none'; setHl(null); return; }
    var ok = selFree(selRect), n = selRect.w * selRect.h, net = n * CFG.precioBloque, tot = net * (1 + CFG.iva / 100);
    setHl([selRect], ok ? 'ok' : 'bad');
    var a = label(selRect.c, selRect.f), b = label(selRect.c + selRect.w - 1, selRect.f + selRect.h - 1);
    var h = '<strong>Selección:</strong> bloques ' + a + ' a ' + b + ' · ' + selRect.w + ' × ' + selRect.h + ' = <strong>' + n.toLocaleString('es-ES') + ' bloques</strong> (' + (n * CFG.pixelesPorBloque).toLocaleString('es-ES') + ' píxeles)';
    if (ok) {
      h += '<br><strong>Precio: ' + money(net) + ' + ' + CFG.iva + ' % IVA = ' + money(tot) + '</strong> ';
      var subj = encodeURIComponent('Reserva de espacio publicitario: bloques ' + a + ' a ' + b);
      var body = encodeURIComponent('Hola, me interesa reservar el grupo de bloques ' + a + ' a ' + b + ' (' + selRect.w + ' x ' + selRect.h + ' = ' + n + ' bloques).\r\nPrecio indicado: ' + money(net) + ' + ' + CFG.iva + ' % IVA = ' + money(tot) + '.\r\n\r\nEmpresa:\r\nWeb:\r\nPersona de contacto:\r\nTeléfono:\r\n\r\nGracias.');
      h += '<a class="btn btn-primary" style="margin-left:8px" href="mailto:' + CFG.email + '?subject=' + subj + '&body=' + body + '">Reservar selección</a>';
    } else {
      h += '<br><span style="color:#b3261e">La selección incluye bloques ocupados o fuera de la zona en venta. Ajusta el rectángulo.</span> ';
    }
    h += '<button type="button" class="btn btn-outline" style="margin-left:8px;border-color:var(--navy);color:var(--navy)" id="selClear">Borrar selección</button>';
    selInfo.innerHTML = h; selInfo.style.display = 'block';
    document.getElementById('selClear').onclick = function () { selRect = null; updateSel(); };
  }
  selBtn.onclick = function () {
    selMode = !selMode; selRect = null; selDrag = false; sticky = false; updateSel();
    selBtn.textContent = selMode ? 'Salir de la selección' : 'Seleccionar bloques';
    selBtn.classList.toggle('activo', selMode);
    dom.style.cursor = selMode ? 'crosshair' : 'grab';
    msg.textContent = selMode ? 'Arrastra sobre bloques libres para elegir un grupo; pulsa un bloque para elegir solo uno. Para mover la vista, sal de la selección.' : '';
  };
  var dom = renderer.domElement;
  dom.style.touchAction = 'none'; dom.style.cursor = 'grab';
  dom.addEventListener('pointerdown', function (e) {
    if (selMode) { var p0 = pick(e); if (p0 && forSale(p0.c, p0.f)) { selDrag = true; selStart = p0; selRect = rectOf(p0, p0); updateSel(); dom.setPointerCapture(e.pointerId); } return; }
    dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; target = null; dom.setPointerCapture(e.pointerId); dom.style.cursor = 'grabbing'; });
  dom.addEventListener('pointermove', function (e) {
    if (selMode) {
      if (selDrag) { var p1 = pick(e); if (p1) { selRect = rectOf(selStart, p1); updateSel(); } tip.style.display = 'none'; }
      else { var d0 = describe(pick(e)); if (d0) { tip.textContent = d0.txt; placeTip(e); } else tip.style.display = 'none'; }
      return;
    }
    if (dragging) {
      var dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY;
      if (flat) {
        var perPx = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / dom.clientHeight;
        camera.position.x -= dx * perPx; camera.position.y += dy * perPx; clampPan();
      } else {
        var k = 0.0055 * camera.position.z / 3.1;
        globe.rotation.y += dx * k; globe.rotation.x = Math.max(-1.3, Math.min(1.3, globe.rotation.x + dy * k));
      }
      tip.style.display = 'none';
    } else {
      lastPt = { clientX: e.clientX, clientY: e.clientY };
      applyHover(e);
    }
  });
  /* El globo solo se detiene mientras el cursor está sobre un bloque; en el resto de la imagen sigue girando */
  var hoverBlock = false, lastPt = null, hoverTick = 0;
  function applyHover(e) {
    var d = describe(pick(e));
    hoverBlock = !!(d && d.res);
    if (d) {
      tip.textContent = d.txt; placeTip(e);
      dom.style.cursor = d.res ? 'pointer' : 'grab';
      if (!sticky) setHl(d.res);
    } else { tip.style.display = 'none'; if (!sticky) setHl(null); dom.style.cursor = 'grab'; }
  }
  dom.addEventListener('pointerup', function (e) {
    if (selMode) { selDrag = false; return; }
    dragging = false; dom.style.cursor = 'grab';
    if (moved < 6) { var d = describe(pick(e)); if (d && d.res) openFicha(d); }
  });
  dom.addEventListener('pointerenter', function () { over = true; });
  dom.addEventListener('pointerleave', function () { over = false; hoverBlock = false; lastPt = null; tip.style.display = 'none'; if (!sticky && !selMode) setHl(null); });
  dom.addEventListener('wheel', function (e) { e.preventDefault(); camera.position.z = Math.max(zMin(), Math.min(zMax(), camera.position.z + e.deltaY * (flat ? 0.0012 : 0.0015))); if (flat) clampPan(); }, { passive: false });
  document.getElementById('zoomMas').onclick = function () { camera.position.z = Math.max(zMin(), camera.position.z - (flat ? 0.6 : 0.4)); if (flat) clampPan(); };
  document.getElementById('zoomMenos').onclick = function () { camera.position.z = Math.min(zMax(), camera.position.z + (flat ? 0.6 : 0.4)); if (flat) clampPan(); };

  /* ---------- ficha ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }
  function openFicha(d) {
    var h = '';
    if (d.a) {
      var a = d.a, n = 0; a.bloques.forEach(function (b) { n += b.w * b.h; });
      if (a.imagen) h += '<img src="' + esc(a.imagen) + '" alt="' + esc(a.nombre) + '" style="width:96px;height:96px;object-fit:cover;border-radius:6px;display:block;margin-bottom:8px">';
      h += '<h3>' + esc(a.nombre) + '</h3>';
      h += '<p class="ficha-meta">' + esc(a.ciudad) + ' · ' + n.toLocaleString('es-ES') + (n === 1 ? ' bloque' : ' bloques') + ' (' + (n * CFG.pixelesPorBloque).toLocaleString('es-ES') + ' píxeles)</p>';
      if (a.hasta) { var dr = diasRest(a); h += '<p class="ficha-meta">' + (a.desde ? 'Publicado el ' + fd(a.desde) + ' · ' : '') + 'Vigente hasta el ' + fd(a.hasta) + ' (' + (dr > 1 ? 'quedan ' + dr + ' días' : dr === 1 ? 'queda 1 día' : 'último día') + ')' + (esNuevo(a) ? ' · <strong style="color:#8a6200">Nuevo</strong>' : '') + '</p>'; }
      h += '<p>' + esc(a.descripcion) + '</p>';
      h += '<p><a class="btn btn-primary" href="' + esc(a.url) + '" target="_blank" rel="sponsored nofollow noopener">Visitar web</a></p>';
      if (a.slug) h += '<p style="font-size:0.85rem;margin:0"><button type="button" class="btn btn-outline" id="copiarEnlace" style="border-color:var(--navy);color:var(--navy);padding:6px 12px;font-size:0.85rem">Copiar enlace directo</button> <span id="copiarMsg" style="color:#1d4e89"></span></p>';
    } else {
      var p = d.libre, lbl = label(p.c, p.f);
      var subj = encodeURIComponent('Reserva de espacio publicitario: bloque ' + lbl);
      var body = encodeURIComponent('Hola, me interesa reservar el bloque ' + lbl + ' (u otros contiguos).\r\n\r\nNúmero de bloques:\r\nEmpresa:\r\nWeb:\r\nPersona de contacto:\r\nTeléfono:\r\n\r\nGracias.');
      h += '<h3>Bloque ' + lbl + '</h3><p class="ficha-meta">Libre · ' + CFG.pixelesPorBloque + ' píxeles (10×10) · ' + eur.format(CFG.precioBloque) + ' + ' + CFG.iva + ' % IVA (' + eur.format(precioIva) + ')</p>';
      h += '<p>Este espacio está disponible. Puedes reservarlo solo o junto a otros bloques contiguos para conseguir un anuncio más grande.</p>';
      h += '<p><a class="btn btn-primary" href="mailto:' + CFG.email + '?subject=' + subj + '&body=' + body + '">Reservar este espacio</a></p>';
    }
    fichaBody.innerHTML = h; modal.style.display = 'flex';
    var cb = document.getElementById('copiarEnlace');
    if (cb) cb.onclick = function () {
      var link = location.href.split('#')[0].split('?')[0] + '?anunciante=' + encodeURIComponent(d.a.slug);
      var ok = function () { document.getElementById('copiarMsg').textContent = 'Enlace copiado'; };
      var fb = function () { window.prompt('Copia el enlace:', link); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(ok, fb); else fb();
    };
  }
  function closeFicha() { modal.style.display = 'none'; }
  document.getElementById('fichaCerrar').onclick = closeFicha;
  modal.addEventListener('click', function (e) { if (e.target === modal) closeFicha(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeFicha(); });

  /* ---------- buscador ---------- */
  function goTo(c, f) {
    var u = (c + 0.5) / COLS, v = (f + 0.5) / ROWS;
    if (flat) { target = { flat: true, px: (u - 0.5) * 4, py: (0.5 - v) * 2, z: Math.min(camera.position.z, 1.2) }; }
    else { target = { y: Math.PI / 2 - 2 * Math.PI * u, x: Math.PI / 2 - v * Math.PI }; camera.position.z = Math.min(camera.position.z, 2.0); }
  }
  function buscar() {
    var q = document.getElementById('buscaInput').value.trim().toLowerCase();
    msg.textContent = '';
    if (!q) return;
    var m = q.match(/^(\d+)\s*[-,x\s]\s*(\d+)$/);
    if (m) {
      var c = parseInt(m[1], 10) - 1, f = parseInt(m[2], 10) - 1 + CFG.filaMin;
      if (!forSale(c, f)) { msg.textContent = 'Ese bloque no existe. Usa columnas 1-' + COLS + ' y filas 1-' + ROWS_SALE + '.'; return; }
      sticky = true; var d = describe({ c: c, f: f }); setHl(d.res); goTo(c, f);
      msg.textContent = d.a ? 'Bloque ocupado por ' + d.a.nombre + '.' : 'Bloque ' + label(c, f) + ': libre.';
      return;
    }
    var found = CFG.anunciantes.filter(function (a) { return (a.nombre + ' ' + a.ciudad).toLowerCase().indexOf(q) > -1; });
    if (!found.length) { msg.textContent = 'No se encontró ningún anunciante con ese nombre o ciudad.'; return; }
    var a = found[0], b = a.bloques[0];
    sticky = true; setHl(a.bloques); goTo(b.c + b.w / 2 - 0.5, b.f + b.h / 2 - 0.5);
    msg.textContent = found.length > 1 ? found.length + ' resultados; se muestra: ' + a.nombre + '.' : a.nombre + ' (' + a.ciudad + ').';
  }
  document.getElementById('buscaBtn').onclick = buscar;
  document.getElementById('buscaInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); buscar(); } });
  document.getElementById('buscaLimpiar').onclick = function () { document.getElementById('buscaInput').value = ''; msg.textContent = ''; sticky = false; if (!selRect) setHl(null); };

  /* ---------- listado y resumen ---------- */
  document.getElementById('listaAnunciantes').innerHTML = !CFG.anunciantes.length ? '<li>Todavía no hay anunciantes. Todos los bloques están disponibles: reserva el tuyo escribiendo a ' + esc(CFG.email) + '.</li>' : CFG.anunciantes.map(function (a) {
    return '<li><strong>' + esc(a.nombre) + '</strong> · ' + esc(a.ciudad) + '<br>' + esc(a.descripcion) +
      ' <a href="' + esc(a.url) + '" target="_blank" rel="sponsored nofollow noopener">Visitar web</a></li>';
  }).join('');
  var ul = document.getElementById('ultimos');
  if (ul) {
    var ult = CFG.anunciantes.filter(function (a) { return a.desde; }).sort(function (x, y) { return pd(y.desde) - pd(x.desde); }).slice(0, 6);
    if (!ult.length) { ul.parentNode.style.display = 'none'; }
    else ul.innerHTML = ult.map(function (a, i) {
      var vig = a.hasta ? '<br><small>Vigente hasta ' + fd(a.hasta) + '</small>' : '';
      return '<li><button type="button" class="ult-card" data-i="' + i + '">' + (esNuevo(a) ? '<span class="ult-new">Nuevo</span>' : '') + (a.imagen ? '<img src="' + esc(a.imagen) + '" alt="">' : '<span class="ult-ini" style="background:' + esc(a.color) + '"></span>') + '<strong>' + esc(a.nombre) + '</strong><br><small>' + esc(a.ciudad) + ' · desde ' + fd(a.desde) + '</small>' + vig + '</button></li>';
    }).join('');
    if (ult.length) Array.prototype.forEach.call(ul.querySelectorAll('.ult-card'), function (btn) {
      btn.onclick = function () {
        var a = ult[+btn.getAttribute('data-i')], b = a.bloques[0];
        sticky = true; setHl(a.bloques); goTo(b.c + b.w / 2 - 0.5, b.f + b.h / 2 - 0.5);
        msg.textContent = a.nombre + ' (' + a.ciudad + ').';
        document.getElementById('globo').scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(function () { openFicha({ a: a, res: a.bloques, txt: a.nombre }); }, 1200);
      };
    });
  }
  var total = COLS * ROWS_SALE, ocupados = 0;
  for (var yy = CFG.filaMin; yy <= CFG.filaMax; yy++) for (var xx = 0; xx < COLS; xx++) if (owner[yy][xx] >= 0) ocupados++;
  document.getElementById('resumenPrecio').textContent = 'Cada bloque tiene ' + CFG.pixelesPorBloque + ' píxeles (10×10) y cuesta ' + eur.format(CFG.precioBloque) + ' + ' + CFG.iva + ' % IVA (' + eur.format(precioIva) + ').';
  document.getElementById('resumenOcupacion').textContent = ocupados.toLocaleString('es-ES') + ' de ' + total.toLocaleString('es-ES') + ' bloques ocupados.';

  /* ---------- bucle ---------- */
  function norm(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  /* botones de giro: mientras se mantienen pulsados mueven el globo (o el plano) */
  var rotDir = null;
  Array.prototype.forEach.call(document.querySelectorAll('.globo-pad button'), function (b) {
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); rotDir = b.getAttribute('data-d'); target = null; try { b.setPointerCapture(e.pointerId); } catch (x) {} });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { b.addEventListener(ev, function () { rotDir = null; }); });
  });
  function applyRot() {
    var dx = rotDir === 'r' ? 1 : rotDir === 'l' ? -1 : 0, dy = rotDir === 'd' ? 1 : rotDir === 'u' ? -1 : 0;
    if (flat) {
      var perPx = 2 * camera.position.z * Math.tan(camera.fov * Math.PI / 360) / dom.clientHeight;
      camera.position.x -= dx * 5 * perPx; camera.position.y += dy * 5 * perPx; clampPan();
    } else {
      var k = 0.03 * camera.position.z / 3.1;
      globe.rotation.y += dx * k; globe.rotation.x = Math.max(-1.3, Math.min(1.3, globe.rotation.x + dy * k));
    }
  }
  function loop() {
    for (var si = 0; si < sats.length; si++) { var st = sats[si]; st.a += st.w * 0.004; st.s.position.set(Math.cos(st.a) * st.r, 0, Math.sin(st.a) * st.r); st.halo.material.opacity = 0.2 + 0.2 * Math.sin(Date.now() / 400 + si * 2); st.orbit.visible = !flat; }
    nuevoMat.opacity = 0.12 + 0.38 * (0.5 + 0.5 * Math.sin(Date.now() / 320));
    if (rotDir) { applyRot(); }
    if (target && target.flat) {
      camera.position.x += (target.px - camera.position.x) * 0.1; camera.position.y += (target.py - camera.position.y) * 0.1; camera.position.z += (target.z - camera.position.z) * 0.1; clampPan();
      if (Math.abs(target.px - camera.position.x) < 0.004 && Math.abs(target.py - camera.position.y) < 0.004) target = null;
    } else if (target) {
      globe.rotation.y += norm(target.y - globe.rotation.y) * 0.08;
      globe.rotation.x += (target.x - globe.rotation.x) * 0.08;
      if (Math.abs(norm(target.y - globe.rotation.y)) < 0.002 && Math.abs(target.x - globe.rotation.x) < 0.002) target = null;
    } else if (!flat && !dragging && !selMode && !hoverBlock && !rotDir) {
      globe.rotation.y += 0.0014;
      if (over && lastPt && (++hoverTick % 4 === 0)) applyHover(lastPt);
    }
    glow.rotation.copy(globe.rotation);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  /* ---------- fondo de estrellas y estrellas fugaces ---------- */
  (function () {
    var cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;';
    wrap.insertBefore(cv, wrap.firstChild);
    renderer.domElement.style.position = 'relative'; renderer.domElement.style.zIndex = '1';
    var cx = cv.getContext('2d'), stars = [], shoots = [], comets = [], neb = null, sw = 0, sh = 0, nextShoot = 1200, nextComet = 3500;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function build() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      sw = wrap.clientWidth; sh = wrap.clientHeight; cv.width = sw * dpr; cv.height = sh * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      neb = document.createElement('canvas'); neb.width = sw; neb.height = sh; var nx = neb.getContext('2d');
      [[0.18, 0.28, 0.55, '90,60,200', 0.30], [0.80, 0.22, 0.50, '40,120,220', 0.26], [0.70, 0.82, 0.60, '150,50,170', 0.24], [0.22, 0.80, 0.45, '30,150,170', 0.22], [0.50, 0.50, 0.70, '30,60,140', 0.20]].forEach(function (n0) {
        var r = Math.max(sw, sh) * n0[2], g = nx.createRadialGradient(n0[0] * sw, n0[1] * sh, 0, n0[0] * sw, n0[1] * sh, r);
        g.addColorStop(0, 'rgba(' + n0[3] + ',' + n0[4] + ')'); g.addColorStop(0.5, 'rgba(' + n0[3] + ',' + (n0[4] * 0.35) + ')'); g.addColorStop(1, 'rgba(' + n0[3] + ',0)');
        nx.fillStyle = g; nx.fillRect(0, 0, sw, sh);
      });
      var n = Math.round(sw * sh / 2600); stars = [];
      for (var i = 0; i < n; i++) stars.push({ x: Math.random() * sw, y: Math.random() * sh, r: Math.random() * 1.3 + 0.2, a: Math.random() * 0.7 + 0.3, s: Math.random() * 2 + 0.5, p: Math.random() * 6.28 });
    }
    function spawn() {
      var ang = (20 + Math.random() * 25) * Math.PI / 180, sp = 420 + Math.random() * 340;
      shoots.push({ x: Math.random() * sw * 0.8 - sw * 0.05, y: Math.random() * sh * 0.45, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0, max: 0.9 + Math.random() * 0.7, len: 90 + Math.random() * 90 });
    }
    var last = performance.now();
    function frame(t) {
      var dt = Math.min(0.05, (t - last) / 1000); last = t;
      cx.clearRect(0, 0, sw, sh);
      if (neb) { cx.globalAlpha = reduce ? 0.9 : 0.8 + 0.2 * Math.sin(t / 4000); cx.drawImage(neb, 0, 0, sw, sh); cx.globalAlpha = 1; }
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i], tw = reduce ? 1 : 0.55 + 0.45 * Math.sin(t / 1000 * s.s + s.p);
        cx.globalAlpha = s.a * tw; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.283); cx.fill();
      }
      cx.globalAlpha = 1;
      if (!reduce) {
        nextShoot -= dt * 1000;
        if (nextShoot <= 0) { spawn(); nextShoot = 900 + Math.random() * 1800; }
        for (var k = shoots.length - 1; k >= 0; k--) {
          var m = shoots[k]; m.life += dt; m.x += m.vx * dt; m.y += m.vy * dt;
          var f = m.life / m.max; if (f >= 1) { shoots.splice(k, 1); continue; }
          var al = f < 0.2 ? f / 0.2 : 1 - (f - 0.2) / 0.8, nx = m.vx / Math.hypot(m.vx, m.vy), ny = m.vy / Math.hypot(m.vx, m.vy);
          var gr = cx.createLinearGradient(m.x, m.y, m.x - nx * m.len, m.y - ny * m.len);
          gr.addColorStop(0, 'rgba(255,255,255,' + al + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          cx.strokeStyle = gr; cx.lineWidth = 2; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(m.x, m.y); cx.lineTo(m.x - nx * m.len, m.y - ny * m.len); cx.stroke();
          cx.fillStyle = 'rgba(255,255,255,' + al + ')'; cx.beginPath(); cx.arc(m.x, m.y, 2.2, 0, 6.283); cx.fill();
        }
      }
      if (!reduce) {
        nextComet -= dt * 1000;
        if (nextComet <= 0) {
          var dirR = Math.random() < 0.5, an = (12 + Math.random() * 18) * Math.PI / 180, spd = 110 + Math.random() * 60;
          comets.push({ x: dirR ? -60 : sw + 60, y: Math.random() * sh * 0.4, vx: (dirR ? 1 : -1) * Math.cos(an) * spd, vy: Math.sin(an) * spd, len: 240 + Math.random() * 120, life: 0 });
          nextComet = 9000 + Math.random() * 12000;
        }
        for (var q = comets.length - 1; q >= 0; q--) {
          var c = comets[q]; c.life += dt; c.x += c.vx * dt; c.y += c.vy * dt;
          if (c.x < -c.len - 80 || c.x > sw + c.len + 80 || c.y > sh + 80) { comets.splice(q, 1); continue; }
          var sp = Math.hypot(c.vx, c.vy), ux = c.vx / sp, uy = c.vy / sp, fade = Math.min(1, c.life / 1.2);
          var tg = cx.createLinearGradient(c.x, c.y, c.x - ux * c.len, c.y - uy * c.len);
          tg.addColorStop(0, 'rgba(190,225,255,' + (0.85 * fade) + ')'); tg.addColorStop(0.4, 'rgba(120,170,255,' + (0.35 * fade) + ')'); tg.addColorStop(1, 'rgba(120,170,255,0)');
          cx.strokeStyle = tg; cx.lineCap = 'round'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(c.x, c.y); cx.lineTo(c.x - ux * c.len, c.y - uy * c.len); cx.stroke();
          cx.lineWidth = 2; cx.beginPath(); cx.moveTo(c.x, c.y); cx.lineTo(c.x - ux * c.len * 1.25, c.y - uy * c.len * 1.25 - 4); cx.stroke();
          var hg = cx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 16); hg.addColorStop(0, 'rgba(255,255,255,' + fade + ')'); hg.addColorStop(0.35, 'rgba(180,215,255,' + (0.6 * fade) + ')'); hg.addColorStop(1, 'rgba(180,215,255,0)');
          cx.fillStyle = hg; cx.beginPath(); cx.arc(c.x, c.y, 16, 0, 6.283); cx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    build(); window.addEventListener('resize', build); requestAnimationFrame(frame);
  })();

  /* ---------- enlace directo: ?anunciante=slug  o  ?bloque=33-33 ---------- */
  (function () {
    var q = new URLSearchParams(location.search), a = null, c, f, d = null;
    var s = q.get('anunciante'), bl = q.get('bloque');
    if (s) {
      s = s.toLowerCase();
      CFG.anunciantes.forEach(function (x) { if (!a && x.slug && x.slug.toLowerCase() === s) a = x; });
      if (!a) { msg.textContent = 'No se encontró ese anunciante.'; return; }
      var b = a.bloques[0]; c = b.c + b.w / 2 - 0.5; f = b.f + b.h / 2 - 0.5;
      d = { a: a, res: a.bloques, txt: a.nombre };
    } else if (bl) {
      var m = bl.match(/^(\d+)\s*[-,x]\s*(\d+)$/);
      if (!m) return;
      c = parseInt(m[1], 10) - 1; f = parseInt(m[2], 10) - 1 + CFG.filaMin;
      if (!forSale(c, f)) { msg.textContent = 'Ese bloque no existe.'; return; }
      d = describe({ c: c, f: f });
    } else return;
    sticky = true; setHl(d.res); goTo(c, f);
    msg.textContent = d.a ? d.a.nombre + ' (' + d.a.ciudad + ').' : 'Bloque ' + label(c, f) + ': libre.';
    setTimeout(function () { openFicha(d); }, 1400);
    var gb = document.getElementById('globo'); if (gb && gb.scrollIntoView) gb.scrollIntoView({ block: 'center' });
  })();

  resize(); loop();
})();
