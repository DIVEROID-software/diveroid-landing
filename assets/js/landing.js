(() => {
  "use strict";

  // Preserve the existing company-information visibility setting.
  const SHOW_LEGAL_INFO = false;
  const form = document.getElementById("l-email-form");
  const input = document.getElementById("l-email-input");
  const submit = document.getElementById("l-email-btn");
  const status = document.getElementById("email-status");
  let currentLang = document.documentElement.lang === "en" ? "en" : "ko";
  let submissionState = "idle";

  function renderFormState() {
    const copy = window.LANDING_CONTENT[currentLang].home;
    const pending = submissionState === "pending";
    input.disabled = pending;
    submit.disabled = pending;
    form.setAttribute("aria-busy", String(pending));
    submit.textContent = pending ? copy.emailPending : copy.emailButton;
    status.textContent = submissionState === "success" ? copy.emailSuccess
      : submissionState === "error" ? copy.emailError : "";
  }

  function setLang(lang, updateUrl = false) {
    if (lang !== "ko" && lang !== "en") return;
    currentLang = lang;
    document.documentElement.lang = lang;
    const content = window.LANDING_CONTENT[lang];
    const copy = content.home;
    document.querySelectorAll("[data-copy]").forEach((element) => {
      element.textContent = copy[element.dataset.copy];
    });
    document.querySelectorAll("[data-aria]").forEach((element) => {
      element.setAttribute("aria-label", copy[element.dataset.aria]);
    });
    document.querySelectorAll("[data-alt]").forEach((element) => {
      element.alt = copy[element.dataset.alt];
    });
    document.querySelectorAll("[data-ko-only]").forEach((element) => {
      element.hidden = lang !== "ko";
    });
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.language === lang));
    });
    document.getElementById("watchdive-link").href = lang === "ko"
      ? "https://watchdive.diveroid.com/ko" : "https://watchdive.diveroid.com/";
    input.placeholder = copy.emailPlaceholder;
    document.title = copy.pageTitle;
    document.querySelector('meta[name="description"]').content = copy.pageDescription;
    if (SHOW_LEGAL_INFO) {
      document.getElementById("legal-info").hidden = false;
      ["brand", "addr", "biz"].forEach((key) => {
        document.getElementById(`legal-${key}`).textContent = content.footer[key];
      });
    }
    try { sessionStorage.setItem("lang", lang); } catch {}
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("lang", lang);
      history.replaceState(null, "", url);
    }
    renderFormState();
  }

  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => setLang(button.dataset.language, true));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submissionState === "pending" || !form.reportValidity()) return;
    const email = input.value.trim();
    const lang = currentLang;
    submissionState = "pending";
    renderFormState();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Subscription failed");
      const result = await response.json();
      if (result.success !== true) throw new Error("Subscription not confirmed");
      submissionState = "success";
      input.value = "";
    } catch {
      submissionState = "error";
    } finally {
      clearTimeout(timeout);
      renderFormState();
    }
  });

  setLang(currentLang);
})();
