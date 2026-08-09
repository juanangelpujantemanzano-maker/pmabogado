document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("interestForm");
  if (!form) return; // not on this page

  var capitalInput = document.getElementById("capital");
  var rateInput = document.getElementById("rate");
  var startDateInput = document.getElementById("startDate");
  var endDateInput = document.getElementById("endDate");
  var statusEl = document.getElementById("status");
  var resultBox = document.getElementById("resultBox");
  var resultSummary = document.getElementById("resultSummary");
  var resultTableBody = document.getElementById("resultTableBody");
  var totalInterestOut = document.getElementById("totalInterestOut");
  var totalFinalOut = document.getElementById("totalFinalOut");
  var resetBtn = document.getElementById("resetBtn");

  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var DAYS_PER_YEAR = 365;

  function setStatus(msg, isError) {
    statusEl.style.display = msg ? "block" : "none";
    statusEl.textContent = msg || "";
    statusEl.style.color = isError ? "#b3261e" : "";
  }

  function formatEuros(value) {
    return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  }

  function parseDateInput(value) {
    // Los <input type="date"> devuelven "YYYY-MM-DD"; se construye como
    // fecha local a mediodía para evitar desfases por huso horario.
    var parts = value.split("-");
    if (parts.length !== 3) return null;
    var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    resultBox.style.display = "none";
    setStatus("");

    var capital = parseFloat(capitalInput.value);
    var ratePercent = parseFloat(rateInput.value);
    var startDate = parseDateInput(startDateInput.value);
    var endDate = parseDateInput(endDateInput.value);

    if (!isFinite(capital) || capital < 0) {
      setStatus("Introduce un capital inicial válido.", true);
      return;
    }
    if (!isFinite(ratePercent) || ratePercent < 0) {
      setStatus("Introduce un tipo de interés válido.", true);
      return;
    }
    if (!startDate || !endDate) {
      setStatus("Introduce la fecha de inicio y la fecha de fin.", true);
      return;
    }
    if (endDate <= startDate) {
      setStatus("La fecha de fin debe ser posterior a la fecha de inicio.", true);
      return;
    }

    var rate = ratePercent / 100;
    var totalDays = daysBetween(startDate, endDate);

    // Interés simple: siempre se calcula sobre el capital inicial (no sobre
    // el capital más los intereses acumulados), prorrateado por días exactos
    // dentro de cada año natural: I = Capital × Tipo × (días / 365).
    resultTableBody.innerHTML = "";
    var startYear = startDate.getFullYear();
    var endYear = endDate.getFullYear();
    var accruedInterest = 0;

    for (var year = startYear; year <= endYear; year++) {
      var segmentStart = (year === startYear) ? startDate : new Date(year, 0, 1, 12, 0, 0);
      var segmentEndExclusive = (year === endYear) ? endDate : new Date(year + 1, 0, 1, 12, 0, 0);
      var daysInSegment = daysBetween(segmentStart, segmentEndExclusive);
      if (daysInSegment <= 0) continue;

      var interestForYear = capital * rate * (daysInSegment / DAYS_PER_YEAR);
      accruedInterest += interestForYear;
      var totalAmount = capital + accruedInterest;

      var row = document.createElement("tr");
      row.innerHTML =
        "<td>" + year + "</td>" +
        "<td>" + daysInSegment + "</td>" +
        "<td>" + formatEuros(interestForYear) + "</td>" +
        "<td>" + formatEuros(totalAmount) + "</td>";
      resultTableBody.appendChild(row);
    }

    var totalInterest = capital * rate * (totalDays / DAYS_PER_YEAR);
    var finalAmount = capital + totalInterest;
    var fmtDate = function (d) { return d.toLocaleDateString("es-ES"); };
    resultSummary.innerHTML =
      "Capital inicial: <strong>" + formatEuros(capital) + "</strong> · " +
      "Tipo de interés: <strong>" + ratePercent.toLocaleString("es-ES") + "%</strong> anual · " +
      "Período: <strong>" + fmtDate(startDate) + " a " + fmtDate(endDate) + "</strong> (" + totalDays + " días)";

    totalInterestOut.textContent = formatEuros(totalInterest);
    totalFinalOut.textContent = formatEuros(finalAmount);

    resultBox.style.display = "flex";
  });

  resetBtn.addEventListener("click", function () {
    form.reset();
    resultBox.style.display = "none";
    setStatus("");
    capitalInput.focus();
  });
});
