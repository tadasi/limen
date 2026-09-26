(function () {
  "use strict";

  // css/style.css の --fade-in / --fade-out と揃える
  const TIMING = {
    fadeOut: 700,
    textLead: 1100,
    paragraphStagger: 750,
    choicesLead: 500,
    choiceStagger: 160,
    fadeIn: 1400,
  };

  const story = window.LIMEN_STORY;
  const stage = document.getElementById("stage");
  const illustration = document.getElementById("illustration");
  const image = document.getElementById("illustration-image");
  const narrative = document.getElementById("narrative");
  const choices = document.getElementById("choices");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderToken = 0;
  let enableTimer = null;
  let currentScene = null;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
  }

  function preload(src) {
    return new Promise((resolve) => {
      if (!src) return resolve();
      const img = new Image();
      img.onload = img.onerror = () => resolve();
      img.src = src;
    });
  }

  function setChoicesEnabled(enabled) {
    choices.inert = !enabled;
    clearTimeout(enableTimer);
  }

  function build(scene) {
    image.src = scene.image;
    image.alt = scene.alt || "";
    illustration.style.setProperty("--delay", "0ms");

    narrative.replaceChildren();
    scene.text.forEach((line, i) => {
      const p = document.createElement("p");
      p.className = "fx";
      p.textContent = line;
      p.style.setProperty("--delay", `${TIMING.textLead + i * TIMING.paragraphStagger}ms`);
      narrative.append(p);
    });

    const choicesStart =
      TIMING.textLead + (scene.text.length - 1) * TIMING.paragraphStagger + TIMING.choicesLead;

    choices.replaceChildren();
    scene.choices.forEach((choice, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice fx";
      button.textContent = choice.label;
      button.style.setProperty("--delay", `${choicesStart + i * TIMING.choiceStagger}ms`);
      button.addEventListener("click", () => go(choice.next));
      choices.append(button);
    });

    return choicesStart + (scene.choices.length - 1) * TIMING.choiceStagger + TIMING.fadeIn;
  }

  async function show(sceneId, { initial = false } = {}) {
    const scene = story.scenes[sceneId];
    if (!scene) {
      console.error(`limen: scene "${sceneId}" が見つかりません`);
      return;
    }

    const token = ++renderToken;
    setChoicesEnabled(false);

    if (!initial) {
      stage.classList.remove("is-shown", "is-instant");
      await wait(TIMING.fadeOut);
    }

    await preload(scene.image);
    if (token !== renderToken) return;

    currentScene = sceneId;
    history.replaceState(null, "", `${location.pathname}${location.search}#${sceneId}`);

    const total = build(scene);
    // 初期状態（非表示）を確定させてからトランジションを開始する
    void stage.offsetWidth;
    stage.classList.add("is-shown");

    scene.choices.forEach((choice) => {
      const next = story.scenes[choice.next];
      if (next) preload(next.image);
    });

    enableTimer = setTimeout(() => {
      if (token === renderToken) setChoicesEnabled(true);
    }, reducedMotion ? 0 : total);
  }

  function go(sceneId) {
    if (choices.inert) return;
    show(sceneId);
  }

  function skip() {
    if (!stage.classList.contains("is-shown") || !choices.inert) return;
    stage.classList.add("is-instant");
    setChoicesEnabled(true);
  }

  illustration.addEventListener("click", skip);
  narrative.addEventListener("click", skip);

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === " " || event.key === "Enter") {
      if (document.activeElement && document.activeElement.classList.contains("choice")) return;
      if (choices.inert) {
        event.preventDefault();
        skip();
      }
      return;
    }

    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && index >= 0) {
      const button = choices.children[index];
      if (button) button.click();
    }
  });

  window.addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && id !== currentScene && story.scenes[id]) show(id);
  });

  const requested = decodeURIComponent(location.hash.slice(1));
  show(story.scenes[requested] ? requested : story.start, { initial: true });
})();
