(function () {
  var fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var fmtN = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  var form = document.getElementById('revForm');
  var statusEl = document.getElementById('status');
  var resultBox = document.getElementById('resultBox');
  var MAX_MONTHS = 1200;

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
  }

  function simulate(P, tae, cuota) {
    var i = Math.pow(1 + tae / 100, 1 / 12) - 1;
    if (cuota <= P * i + 0.005) {
      return { never: true, minimum: P * i };
    }
    var bal = P, months = 0, totalInt = 0, totalPaid = 0, rows = [];
    var yPaid = 0, yInt = 0;
    while (bal > 0.005 && months < MAX_MONTHS) {
      var interest = bal * i;
      var pay = Math.min(cuota, bal + interest);
      bal = bal + interest - pay;
      totalInt += interest;
      totalPaid += pay;
      yPaid += pay;
      yInt += interest;
      months++;
      if (months % 12 === 0 || bal <= 0.005) {
        rows.push({ year: Math.ceil(months / 12), paid: yPaid, interest: yInt, balance: Math.max(bal, 0) });
        yPaid = 0; yInt = 0;
      }
    }
    return { never: false, months: months, totalInt: totalInt, totalPaid: totalPaid, rows: rows, capped: months >= MAX_MONTHS && bal > 0.005 };
  }

  function duration(months) {
    var y = Math.floor(months / 12), m = months % 12;
    var parts = [];
    if (y > 0) parts.push(y + (y === 1 ? ' año' : ' años'));
    if (m > 0) parts.push(m + (m === 1 ? ' mes' : ' meses'));
    return parts.join(' y ') || '0 meses';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.style.display = 'none';
    var P = parseFloat(document.getElementById('deuda').value);
    var tae = parseFloat(document.getElementById('tae').value);
    var cuota = parseFloat(document.getElementById('cuota').value);

    if (!(P > 0) || !(tae >= 0) || !(cuota > 0)) {
      showStatus('Introduce una deuda, una TAE y una cuota mensual válidas.');
      resultBox.style.display = 'none';
      return;
    }

    var r = simulate(P, tae, cuota);
    var summary = document.getElementById('resultSummary');
    var tbody = document.getElementById('resultTableBody');
    var tableWrap = document.getElementById('tableWrap');
    var totals = document.getElementById('totalsSummary');
    var warn = document.getElementById('taeWarning');
    tbody.innerHTML = '';
    warn.style.display = 'none';

    if (r.never) {
      summary.innerHTML = '<strong>Con esa cuota la deuda no baja nunca.</strong> Los intereses de cada mes (unos ' + fmt.format(r.minimum) + ' al inicio) son iguales o superiores a lo que pagas, así que solo pagas intereses y el capital no disminuye. Para que la deuda empiece a bajar, la cuota debe ser superior a ' + fmt.format(r.minimum) + ' al mes.';
      tableWrap.style.display = 'none';
      totals.style.display = 'none';
    } else {
      summary.innerHTML = 'Con una cuota de <strong>' + fmt.format(cuota) + '</strong> al mes tardarás <strong>' + duration(r.months) + '</strong> en pagar una deuda de ' + fmt.format(P) + (r.capped ? ' (más de 100 años: la deuda prácticamente no se acaba)' : '') + '.';
      r.rows.forEach(function (row) {
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + row.year + '</td><td>' + fmt.format(row.paid) + '</td><td>' + fmt.format(row.interest) + '</td><td>' + fmt.format(row.paid - row.interest) + '</td><td>' + fmt.format(row.balance) + '</td>';
        tbody.appendChild(tr);
      });
      document.getElementById('totalInterestOut').textContent = fmt.format(r.totalInt);
      document.getElementById('totalPaidOut').textContent = fmt.format(r.totalPaid);
      document.getElementById('ratioOut').textContent = fmtN.format(r.totalInt / P * 100) + ' % de la deuda inicial';
      tableWrap.style.display = 'block';
      totals.style.display = 'block';
    }

    if (tae >= 20) {
      warn.style.display = 'block';
    }
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
