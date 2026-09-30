// ADE website: mobile nav, light/dark toggle, platform-aware shortcuts, copy
// buttons, reveal-on-scroll, and the latest release version and download links.
(function () {
  "use strict";

  var REPO = "alvin-reyes/better-agentic-ide";
  var isMac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  var isWindows = /Win/i.test(navigator.platform || navigator.userAgent);

  // --- Mobile nav ---------------------------------------------------------
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // --- Light / dark ---------------------------------------------------------
  var themeBtn = document.querySelector(".theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var root = document.documentElement;
      var current = root.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("ade-site-theme", next); } catch (e) { /* private mode */ }
    });
  }

  // --- Shortcuts: macOS keys or Linux/Windows keys --------------------------
  var KEY = "ade-site-platform";
  function readPlatform() {
    try { return localStorage.getItem(KEY) || (isMac ? "mac" : "other"); } catch (e) { return isMac ? "mac" : "other"; }
  }
  function setPlatform(p) {
    try { localStorage.setItem(KEY, p); } catch (e) { /* private mode */ }
    document.querySelectorAll("kbd.key").forEach(function (k) {
      k.textContent = k.getAttribute(p === "mac" ? "data-mac" : "data-other");
    });
    document.querySelectorAll("[data-platform]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-platform") === p ? "true" : "false");
    });
    document.querySelectorAll("[data-only]").forEach(function (el) {
      el.hidden = el.getAttribute("data-only") !== p;
    });
  }
  document.querySelectorAll("[data-platform]").forEach(function (b) {
    b.addEventListener("click", function () { setPlatform(b.getAttribute("data-platform")); });
  });
  setPlatform(readPlatform());

  // --- Copy buttons on code blocks ------------------------------------------
  document.querySelectorAll(".copy").forEach(function (box) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var text = box.querySelector("pre").innerText.trim();
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1500);
      });
    });
    box.appendChild(btn);
  });

  // --- Reveal on scroll --------------------------------------------------------
  // Content is fully visible without JS. Only when IntersectionObserver exists
  // and the visitor hasn't asked for reduced motion do below-the-fold blocks
  // start hidden and fade/slide up as they enter the viewport.
  (function () {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    var sel = [
      ".section-head", ".bento-card", ".feature", ".savings", ".savings-note", ".matrix-wrap",
      ".contract-extras > *", ".keys-grid", ".platform-tabs", ".themes figure", ".install .card",
      ".faq", ".cta-band", ".logos ul"
    ].join(",");
    var els = Array.prototype.slice.call(document.querySelectorAll(sel));
    if (!els.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(function (el) {
      // Anything already on screen stays put, so nothing flashes on load.
      if (el.getBoundingClientRect().top < vh) return;
      // Stagger siblings in a grid slightly.
      var i = 0, n = el;
      while ((n = n.previousElementSibling) && i < 6) if (n.matches(sel)) i++;
      if (i) el.style.setProperty("--reveal-delay", (i * 0.06).toFixed(2) + "s");
      el.classList.add("reveal");
      io.observe(el);
    });
    document.documentElement.classList.add("reveal-on");
  })();

  // --- Latest release: version label and direct download links ---------------
  var versionEls = document.querySelectorAll("[data-latest-version]");
  var downloadEls = document.querySelectorAll("[data-download]");
  if (!versionEls.length && !downloadEls.length) return;

  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.tag_name) return;
      versionEls.forEach(function (el) { el.textContent = rel.tag_name; });
      var assets = rel.assets || [];
      var find = function (re) {
        for (var i = 0; i < assets.length; i++) if (re.test(assets[i].name)) return assets[i].browser_download_url;
        return null;
      };
      var links = {
        "mac-arm": find(/aarch64\.dmg$/),
        "mac-intel": find(/x64\.dmg$/),
        "windows": find(/\.msi$/) || find(/setup\.exe$/),
        "deb": find(/\.deb$/),
        "appimage": find(/\.AppImage$/),
      };
      downloadEls.forEach(function (el) {
        var kind = el.getAttribute("data-download");
        if (kind === "auto") kind = isMac ? "mac-arm" : isWindows ? "windows" : "appimage";
        if (links[kind]) el.href = links[kind];
      });
    })
    .catch(function () { /* keep the links to the releases page */ });
})();
