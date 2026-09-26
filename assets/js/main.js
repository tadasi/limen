(function () {
  "use strict";

  // assets/css/style.css の --fade-in / --fade-out と揃える
  const TIMING = {
    fadeOut: 700,
    textLead: 1100,
    paragraphStagger: 750,
    choicesLead: 500,
    choiceStagger: 160,
    fadeIn: 1400,
  };

  const STORIES_ROOT = "stories/";
  const ENDING_CHOICE_LABEL = "もう一度、目を閉じる";

  // ---- 物語データの登録口（stories/ 以下の JS から呼ばれる） ----

  const registry = { catalog: null, versions: {}, stories: {} };

  window.LIMEN = {
    catalog(data) {
      registry.catalog = data;
    },
    registerVersion(versionId, data) {
      registry.versions[versionId] = data;
    },
    registerStory(versionId, protagonistId, data) {
      registry.stories[`${versionId}/${protagonistId}`] = data;
    },
  };

  // fetch は file:// で使えないため、データは <script> で読み込む
  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(
        src,
        new Promise((resolve, reject) => {
          const el = document.createElement("script");
          el.src = src;
          el.onload = () => resolve();
          el.onerror = () => {
            scripts.delete(src);
            reject(new Error(`${src} を読み込めませんでした`));
          };
          document.head.append(el);
        })
      );
    }
    return scripts.get(src);
  }

  const versionDir = (versionId) => `${STORIES_ROOT}${versionId}/`;
  const storyDir = (versionId, protagonistId) => `${versionDir(versionId)}${protagonistId}/`;

  // データ内の画像パスは、そのデータファイルのあるディレクトリ基準
  function resolveAsset(dir, path) {
    if (!path) return "";
    return new URL(path, new URL(dir, document.baseURI)).href;
  }

  async function loadVersion(versionId) {
    await loadScript(`${versionDir(versionId)}version.js`);
    const version = registry.versions[versionId];
    if (!version) throw new Error(`バージョン "${versionId}" が登録されていません`);
    return version;
  }

  const validated = new Set();

  async function loadStory(versionId, protagonistId) {
    await loadScript(`${storyDir(versionId, protagonistId)}story.js`);
    const key = `${versionId}/${protagonistId}`;
    const story = registry.stories[key];
    if (!story) throw new Error(`主人公 "${protagonistId}" の物語が登録されていません`);
    if (!validated.has(key)) {
      validated.add(key);
      validateStory(story).forEach((problem) => console.error(`limen: ${key}: ${problem}`));
    }
    return story;
  }

  // どの選択をたどっても必ず結末に行き着く（ループしない）ことを確かめる
  function validateStory(story) {
    const problems = [];
    const ids = Object.keys(story.scenes);

    if (!story.scenes[story.start]) problems.push(`開始場面 "${story.start}" がありません`);

    ids.forEach((id) => {
      const scene = story.scenes[id];
      const choices = scene.choices || [];
      if (scene.ending) {
        if (choices.length) problems.push(`結末 "${id}" に choices は書けません`);
        return;
      }
      if (!choices.length) problems.push(`"${id}" は結末ではないのに選択肢がありません`);
      choices.forEach((choice) => {
        if (!story.scenes[choice.next]) problems.push(`"${id}" の行き先 "${choice.next}" がありません`);
      });
    });

    const state = {};
    const reached = new Set();
    (function visit(id, path) {
      const scene = story.scenes[id];
      if (!scene) return;
      reached.add(id);
      if (state[id] === "done") return;
      if (state[id] === "visiting") {
        problems.push(`ループしています: ${[...path, id].join(" → ")}`);
        return;
      }
      state[id] = "visiting";
      (scene.choices || []).forEach((choice) => visit(choice.next, [...path, id]));
      state[id] = "done";
    })(story.start, []);

    ids
      .filter((id) => !reached.has(id))
      .forEach((id) => problems.push(`"${id}" にはどこからもたどり着けません`));

    return problems;
  }

  // ---- 行き先： 指定がなければ主人公はランダム ----
  // URL の #/<version>/<protagonist>/<scene> は、確認用に特定の場面を直接開くためのもの

  function parseRoute() {
    const [version, protagonist, scene] = decodeURIComponent(location.hash.replace(/^#\/?/, ""))
      .split("/")
      .filter(Boolean);
    return { version, protagonist, scene };
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  async function resolveView(route) {
    await loadScript(`${STORIES_ROOT}index.js`);
    const catalog = registry.catalog;
    const versionId = catalog.versions.includes(route.version) ? route.version : catalog.latest;
    const version = await loadVersion(versionId);

    const protagonist =
      version.protagonists.find((p) => p.id === route.protagonist) || pickRandom(version.protagonists);
    const story = await loadStory(versionId, protagonist.id);
    const sceneId = story.scenes[route.scene] ? route.scene : story.start;
    const scene = story.scenes[sceneId];
    const dir = storyDir(versionId, protagonist.id);

    const choices = scene.ending
      ? [{ label: ENDING_CHOICE_LABEL, route: { version: versionId } }]
      : scene.choices.map((choice) => ({
          label: choice.label,
          route: { version: versionId, protagonist: protagonist.id, scene: choice.next },
        }));

    return {
      version,
      view: {
        image: resolveAsset(dir, scene.image),
        alt: scene.alt,
        text: scene.text,
        choices,
      },
      preload: (scene.choices || [])
        .map((choice) => story.scenes[choice.next])
        .filter(Boolean)
        .map((next) => resolveAsset(dir, next.image)),
    };
  }

  // ---- 描画 ----

  const stage = document.getElementById("stage");
  const illustration = document.getElementById("illustration");
  const image = document.getElementById("illustration-image");
  const narrative = document.getElementById("narrative");
  const choices = document.getElementById("choices");
  const markSub = document.getElementById("mark-sub");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderToken = 0;
  let enableTimer = null;

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

  function build(view) {
    image.src = view.image;
    image.alt = view.alt || "";
    illustration.hidden = !view.image;
    illustration.style.setProperty("--delay", "0ms");

    narrative.replaceChildren();
    view.text.forEach((line, i) => {
      const p = document.createElement("p");
      p.className = "fx";
      p.textContent = line;
      p.style.setProperty("--delay", `${TIMING.textLead + i * TIMING.paragraphStagger}ms`);
      narrative.append(p);
    });

    const choicesStart =
      TIMING.textLead + Math.max(view.text.length - 1, 0) * TIMING.paragraphStagger + TIMING.choicesLead;

    choices.replaceChildren();
    view.choices.forEach((choice, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice fx";
      button.textContent = choice.label;
      button.style.setProperty("--delay", `${choicesStart + i * TIMING.choiceStagger}ms`);
      button.addEventListener("click", () => navigate(choice.route));
      choices.append(button);
    });

    return choicesStart + Math.max(view.choices.length - 1, 0) * TIMING.choiceStagger + TIMING.fadeIn;
  }

  function errorView(error) {
    console.error(error);
    return {
      version: null,
      view: {
        image: "",
        text: ["この夢には、まだ入ることができないようです。", error.message],
        choices: [{ label: ENDING_CHOICE_LABEL, route: {} }],
      },
      preload: [],
    };
  }

  async function render(route) {
    const token = ++renderToken;
    setChoicesEnabled(false);

    const leaving = stage.classList.contains("is-shown");
    stage.classList.remove("is-shown", "is-instant");

    const [resolved] = await Promise.all([
      resolveView(route).catch(errorView),
      leaving ? wait(TIMING.fadeOut) : null,
    ]);
    if (token !== renderToken) return;

    await preload(resolved.view.image);
    if (token !== renderToken) return;

    // 再読み込みのたびに主人公を選び直せるよう、URL には現在地を残さない
    if (location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`);

    markSub.textContent = resolved.version ? resolved.version.title : "";
    document.title = resolved.version ? `limen — ${resolved.version.title}` : "limen";

    const total = build(resolved.view);
    // 初期状態（非表示）を確定させてからトランジションを開始する
    void stage.offsetWidth;
    stage.classList.add("is-shown");

    resolved.preload.forEach(preload);

    enableTimer = setTimeout(() => {
      if (token === renderToken) setChoicesEnabled(true);
    }, reducedMotion ? 0 : total);
  }

  function navigate(route) {
    if (choices.inert) return;
    render(route);
  }

  // ---- 操作 ----

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
      if (document.activeElement && document.activeElement.closest("button, a, input")) return;
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
    if (location.hash) render(parseRoute());
  });

  render(parseRoute());
})();
