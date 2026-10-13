(function () {
  var fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  var fmtN = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  var form = document.getElementById('hipForm');
  var statusEl = document.getElementById('status');
  var resultBox = document.getElementById('resultBox');

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
  }

  function simulate(P, years, tin, comision) {
    var n = Math.round(years * 12);
    var i = tin / 100 / 12;
    var cuota = i === 0 ? P / n : P * i / (1 - Math.pow(1 + i, -n));
    var bal = P, totalInt = 0, rows = [], yInt = 0, yCap = 0;
    for (var m = 1; m <= n; m++) {
      var interest = bal * i;
      var cap = cuota - interest;
      if (m === n) cap = bal;
      bal -= cap;
      totalInt += interest;
      yInt += interest;
      yCap += cap;
      if (m % 12 === 0 || m === n) {
        rows.push({ year: Math.ceil(m / 12), paid: yInt + yCap, interest: yInt, capital: yCap, balance: Math.max(bal, 0) });
        yInt = 0; yCap = 0;
      }
    }
    var fee = P * (comision / 100);
    return { cuota: cuota, totalInt: totalInt, fee: fee, total: cuota * n + fee, rows: rows, n: n };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.style.display = 'none';
    var P = parseFloat(document.getElementById('importe').value);
    var years = parseFloat(document.getElementById('plazo').value);
    var tinA = parseFloat(document.getElementById('tinA').value);
    var comRaw = document.getElementById('comision').value;
    var com = comRaw === '' ? 0 : parseFloat(comRaw);
    var tinBRaw = document.getElementById('tinB').value;
    var tinB = tinBRaw === '' ? null : parseFloat(tinBRaw);

    if (!(P > 0) || !(years > 0 && years <= 50) || !(tinA >= 0) || !(com >= 0)) {
      showStatus('Introduce un importe, un plazo (hasta 50 años) y un tipo de interés válidos.');
      resultBox.style.display = 'none';
      return;
    }

    var a = simulate(P, years, tinA, com);
    document.getElementById('cuotaOut').textContent = fmt.format(a.cuota);
    document.getElementById('intOut').textContent = fmt.format(a.totalInt);
    document.getElementById('totalOut').textContent = fmt.format(a.total);
    document.getElementById('ratioOut').textContent = fmtN.format(a.totalInt / P * 100) + ' % del capital';

    var tbody = document.getElementById('resultTableBody');
    tbody.innerHTML = '';
    a.rows.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + row.year + '</td><td>' + fmt.format(row.paid) + '</td><td>' + fmt.format(row.interest) + '</td><td>' + fmt.format(row.capital) + '</td><td>' + fmt.format(row.balance) + '</td>';
      tbody.appendChild(tr);
    });

    var cmp = document.getElementById('cmpBox');
    if (tinB !== null && tinB >= 0) {
      var b = simulate(P, years, tinB, com);
      var diffInt = b.totalInt - a.totalInt;
      var diffCuota = b.cuota - a.cuota;
      var better = diffInt < 0 ? 'B' : (diffInt > 0 ? 'A' : null);
      var txt = '<strong>Comparación:</strong> con el tipo A (' + tinA + ' %) pagas ' + fmt.format(a.cuota) + ' al mes y ' + fmt.format(a.totalInt) + ' de intereses; con el tipo B (' + tinB + ' %) pagas ' + fmt.format(b.cuota) + ' al mes y ' + fmt.format(b.totalInt) + ' de intereses.';
      if (better) {
        txt += ' La opción ' + better + ' te ahorra ' + fmt.format(Math.abs(diffInt)) + ' en intereses durante todo el préstamo (' + fmt.format(Math.abs(diffCuota)) + ' de diferencia en la cuota mensual).';
      } else {
        txt += ' Ambas opciones cuestan lo mismo.';
      }
      cmp.innerHTML = txt;
      cmp.style.display = 'block';
    } else {
      cmp.style.display = 'none';
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
