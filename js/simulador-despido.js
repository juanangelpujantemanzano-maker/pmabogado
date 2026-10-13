(function () {
  var fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var fmtD = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
  var form = document.getElementById('despForm');
  var statusEl = document.getElementById('status');
  var resultBox = document.getElementById('resultBox');
  // Reforma laboral: Real Decreto-ley 3/2012 (entrada en vigor 12/02/2012)
  var CUT = Date.UTC(2012, 1, 12);

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
  }

  function parse(v) {
    var p = v.split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  function addMonths(ms, k) {
    var d = new Date(ms);
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + k, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(day, last));
  }

  // Meses de servicio entre dos fechas; la fracción de mes cuenta como mes completo.
  function monthsBetween(a, b) {
    if (b <= a) return 0;
    var da = new Date(a), db = new Date(b);
    var m = (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
    if (addMonths(a, m) > b) m--;
    if (b > addMonths(a, m)) m++;
    return m;
  }

  function years(m) {
    var y = Math.floor(m / 12), r = m % 12, p = [];
    if (y > 0) p.push(y + (y === 1 ? ' año' : ' años'));
    if (r > 0) p.push(r + (r === 1 ? ' mes' : ' meses'));
    return p.join(' y ') || '0 meses';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.style.display = 'none';
    var tipo = document.getElementById('tipo').value;
    var start = parse(document.getElementById('inicio').value);
    var end = parse(document.getElementById('fin').value);
    var salario = parseFloat(document.getElementById('salario').value);

    if (!document.getElementById('inicio').value || !document.getElementById('fin').value || !(salario > 0)) {
      showStatus('Introduce las dos fechas y un salario bruto anual válido.');
      resultBox.style.display = 'none';
      return;
    }
    if (end <= start) {
      showStatus('La fecha del despido debe ser posterior a la fecha de inicio de la relación laboral.');
      resultBox.style.display = 'none';
      return;
    }

    var T = monthsBetween(start, end);
    var diario = salario / 365;
    var rows = [], dias = 0, capDias, capTxt = '', note = '';

    if (tipo === 'improcedente') {
      var P = 0;
      if (start < CUT) P = end <= CUT ? T : monthsBetween(start, CUT);
      var Q = Math.max(T - P, 0);
      var dPre = P / 12 * 45, dPost = Q / 12 * 33;
      dias = dPre + dPost;
      if (P > 0) {
        capDias = dPre >= 720 ? Math.min(dPre, 1260) : 720;
      } else {
        capDias = 720;
      }
      if (P > 0) rows.push(['Hasta el 11/02/2012 (45 días por año)', years(P), dPre]);
      if (Q > 0) rows.push(['Desde el 12/02/2012 (33 días por año)', years(Q), dPost]);
      if (dias > capDias) {
        capTxt = 'Se aplica el límite legal de ' + fmtD.format(capDias / 30) + ' mensualidades (' + fmtD.format(capDias) + ' días).';
        dias = capDias;
      }
      note = 'Despido improcedente: 33 días de salario por año de servicio (45 días por el período anterior al 12 de febrero de 2012), con un máximo de 24 mensualidades.';
    } else {
      dias = T / 12 * 20;
      capDias = 360;
      rows.push(['20 días por año de servicio', years(T), dias]);
      if (dias > capDias) {
        capTxt = 'Se aplica el límite legal de 12 mensualidades (360 días).';
        dias = capDias;
      }
      note = 'Despido objetivo o colectivo: 20 días de salario por año de servicio, con un máximo de 12 mensualidades.';
    }

    var importe = dias * diario;
    var tbody = document.getElementById('resultTableBody');
    tbody.innerHTML = '';
    rows.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + fmtD.format(r[2]) + ' días</td><td>' + fmt.format(r[2] * diario) + '</td>';
      tbody.appendChild(tr);
    });

    document.getElementById('antigOut').textContent = years(T);
    document.getElementById('diarioOut').textContent = fmt.format(diario);
    document.getElementById('diasOut').textContent = fmtD.format(dias) + ' días';
    document.getElementById('importeOut').textContent = fmt.format(importe);
    document.getElementById('noteOut').textContent = note + (capTxt ? ' ' + capTxt : '');
    resultBox.style.display = 'flex';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('resetBtn').addEventListener('click', function () {
    form.reset();
    resultBox.style.display = 'none';
    statusEl.style.display = 'none';
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
  });
})();
