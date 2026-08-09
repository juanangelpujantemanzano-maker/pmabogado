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

  // Formulario de contacto (Netlify Forms, envío por AJAX sin recargar la página)
  var contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var submitBtn = contactForm.querySelector("button[type=submit]");
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Enviando..."; }

      var data = new FormData(contactForm);
      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString()
      })
        .then(function () {
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
