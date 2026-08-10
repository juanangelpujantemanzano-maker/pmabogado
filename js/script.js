document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  document.querySelectorAll(".accordion-item").forEach(function (item) {
    var header = item.querySelector(".accordion-header");
    header.addEventListener("click", function () {
      item.classList.toggle("open");
    });
  });

  // Open only the item matching the URL hash, if any; otherwise leave all closed
  var target = window.location.hash ? document.querySelector(window.location.hash) : null;
  if (target && target.classList.contains("accordion-item")) {
    target.classList.add("open");
    setTimeout(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  }

  // Formulario de contacto (Formspree, envío por AJAX sin recargar la página)
  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitBtn = contactForm.querySelector("button[type=submit]");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Enviando..."; }

      var data = new FormData(contactForm);
      fetch(contactForm.action, {
        method: "POST",
        headers: { "Accept": "application/json" },
        body: data
      })
        .then(function (response) {
          if (!response.ok) throw new Error("request-failed");
          contactForm.style.display = "none";
          var note = document.getElementById("formNote");
          if (note) { note.style.display = "none"; }
          var success = document.getElementById("formSuccess");
          if (success) { success.style.display = "block"; }
        })
        .catch(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Enviar consulta"; }
          alert("No se ha podido enviar la consulta. Inténtelo de nuevo o escríbanos directamente a juanangel.pujantemanzano@gmail.com.");
        });
    });
  }

  // Botón flotante de WhatsApp (mismo teléfono del despacho)
  var waLink = document.createElement("a");
  waLink.href = "https://wa.me/34666444493?text=" + encodeURIComponent("Hola, me gustaría consultar sobre un asunto legal.");
  waLink.className = "whatsapp-float";
  waLink.target = "_blank";
  waLink.rel = "noopener";
  waLink.setAttribute("aria-label", "Contactar por WhatsApp");
  waLink.innerHTML = '<svg viewBox="0 0 32 32" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.386.71 4.61 1.93 6.47L4 29l7.72-1.9A11.93 11.93 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.7c-1.93 0-3.73-.55-5.26-1.5l-.377-.224-4.58 1.127 1.16-4.47-.246-.386A9.66 9.66 0 0 1 5.3 15c0-5.9 4.8-10.7 10.704-10.7S26.7 9.1 26.7 15 21.908 24.7 16.004 24.7Zm5.87-8.02c-.32-.16-1.9-.938-2.194-1.045-.294-.107-.508-.16-.722.16-.214.32-.83 1.045-1.018 1.26-.187.214-.374.24-.694.08-.32-.16-1.352-.498-2.575-1.588-.952-.85-1.596-1.9-1.783-2.22-.187-.32-.02-.492.14-.652.144-.143.32-.374.48-.56.16-.187.213-.32.32-.534.107-.214.053-.4-.027-.56-.08-.16-.722-1.74-.99-2.383-.26-.624-.524-.54-.722-.55-.187-.008-.4-.01-.614-.01-.214 0-.56.08-.854.4-.294.32-1.12 1.094-1.12 2.668 0 1.573 1.147 3.093 1.307 3.307.16.214 2.257 3.446 5.468 4.833.764.33 1.36.527 1.826.674.767.244 1.464.21 2.016.128.615-.092 1.9-.777 2.167-1.527.267-.75.267-1.393.187-1.527-.08-.134-.294-.214-.614-.374Z"/></svg>';
  document.body.appendChild(waLink);

  // Scroll reveal levels (Inicio, Servicios)
  var levels = document.querySelectorAll(".reveal-level");
  if (levels.length) {
    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: "0px 0px -80px 0px" });
      levels.forEach(function (level) { observer.observe(level); });
    } else {
      levels.forEach(function (level) { level.classList.add("is-visible"); });
    }
  }
});
