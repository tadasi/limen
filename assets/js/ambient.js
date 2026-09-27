(function () {
  "use strict";

  // 音量バーをいちばん上まで上げたときの音量。バーの初期位置（0.7）で、小さめの約 0.5 になる
  const MAX_VOLUME = 1;
  const FADE_IN = 1;
  const FADE_OUT = 1.5;
  // オン/オフと音量は、タブを開いている間だけ覚えておく（新しく開いたときは必ずオフ）
  const STORAGE_KEY = "limen:sound";
  const VOLUME_KEY = "limen:volume";

  // 1 拍の長さ（秒）。約 43 BPM のゆったりした歩み
  const BEAT = 1.4;
  const BEATS_PER_CHORD = 10;

  // 和音進行（D△9 → Bm9 → G△9 → Asus）。数値は MIDI ノート番号
  // 持続音は使わず、すべてピアノのように鳴ってから自然に消える音にしている（酔いやすさへの配慮）
  const CHORDS = [
    { bass: 38, broken: [57, 61, 64, 66] },
    { bass: 47, broken: [54, 57, 61, 66] },
    { bass: 43, broken: [50, 57, 59, 66] },
    { bass: 45, broken: [52, 57, 59, 62] },
  ];

  // 旋律に使う音（D メジャー・ペンタトニック。どの和音の上でも濁らない）
  // 耳に刺さらないよう、いちばん上は B4 までにしている
  const MELODY = [59, 62, 64, 66, 69, 71];

  function frequency(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  // 高音を落とした、柔らかい残響
  function impulse(ctx, seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth += 0.18 * (Math.random() * 2 - 1 - smooth);
        data[i] = smooth * Math.pow(1 - i / length, 3);
      }
    }
    return buffer;
  }

  function createAmbient(ctx) {
    const output = ctx.createGain();
    output.gain.value = 0;

    const master = ctx.createGain();
    master.gain.value = 4;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2800;
    master.connect(tone).connect(output);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 3.5);
    const reverbTone = ctx.createBiquadFilter();
    reverbTone.type = "lowpass";
    reverbTone.frequency.value = 2400;
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    reverb.connect(reverbTone).connect(wet).connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(master);

    // ピアノのような音：柔らかく鳴り、高い倍音ほど早く消える。倍音は控えめにして丸い音にしている
    function piano(note, at, velocity) {
      const f = frequency(note);
      // 低い音ほど長く響く
      const sustain = Math.min(3.6, Math.max(1.6, 2.6 * Math.pow(261.6 / f, 0.35)));

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.3, Math.min(0.3, (note - 60) / 40));
      panner.connect(dry);
      panner.connect(reverb);

      [
        [1, 1, 1],
        [2, 0.25, 0.5],
        [3, 0.06, 0.32],
      ].forEach(([ratio, amount, decay]) => {
        const level = 0.085 * velocity * amount;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(level, at + 0.015);
        envelope.gain.setTargetAtTime(0, at + 0.015, sustain * decay);
        envelope.connect(panner);

        const osc = ctx.createOscillator();
        osc.frequency.value = f * ratio;
        osc.connect(envelope);
        osc.start(at);
        osc.stop(at + sustain * decay * 6 + 0.1);
      });
    }

    let beat = 0;
    let nextBeat = 0;
    let step = 2;
    let lastSound = 0;

    // 音階の上を、ほとんど隣の音へだけ歩くように動く
    function nextNote() {
      step = Math.min(MELODY.length - 1, Math.max(0, step + pick([-1, -1, -1, 1, 1, 1, -2, 2])));
      return MELODY[step];
    }

    function humanize(at) {
      return at + (Math.random() - 0.5) * 0.03;
    }

    // 強弱のばらつきは小さくして、音のトーンを一定に保つ
    function velocity(base) {
      return base + (Math.random() - 0.5) * 0.04;
    }

    // 1 拍ぶんの音を置く。和音の頭で低音と分散和音、残りの拍でときどき旋律
    // 無音が長く続いて音量が落ち込まないよう、3 拍途切れたら旋律を必ず入れる
    function playBeat(index, at) {
      const chord = CHORDS[Math.floor(index / BEATS_PER_CHORD) % CHORDS.length];
      const position = index % BEATS_PER_CHORD;

      if (position === 0) {
        piano(chord.bass, humanize(at), velocity(0.5));
        chord.broken.forEach((note, i) => {
          piano(note, humanize(at + (i + 1) * (BEAT / 2)), velocity(0.45));
        });
        lastSound = index + 2;
        return;
      }
      if (position >= 3 && (Math.random() < 0.35 || index - lastSound >= 3)) {
        piano(nextNote(), humanize(at), velocity(0.5));
        lastSound = index;
      }
    }

    return {
      output,
      start(at) {
        beat = 0;
        lastSound = 0;
        nextBeat = at + 0.3;
      },
      // until（秒）までの音を予約する
      schedule(until) {
        // 止めていた間に過ぎた分は鳴らさず、今から続ける
        const now = ctx.currentTime;
        if (nextBeat < now) nextBeat = now + 0.1;
        while (nextBeat < until) {
          playBeat(beat++, nextBeat);
          nextBeat += BEAT;
        }
      },
      fadeTo(volume, seconds) {
        const now = ctx.currentTime;
        output.gain.cancelScheduledValues(now);
        output.gain.setValueAtTime(output.gain.value, now);
        output.gain.linearRampToValueAtTime(volume, now + seconds);
      },
    };
  }

  // ---- オン/オフ ----

  const controls = document.querySelector(".sound");
  const button = document.getElementById("sound-toggle");
  const slider = document.getElementById("sound-volume");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!controls || !AudioContextClass) {
    if (controls) controls.hidden = true;
    return;
  }

  let ctx = null;
  let ambient = null;
  let on = false;
  let scheduler = null;
  let suspendTimer = null;

  // 耳の感じ方に合わせ、バーの位置の二乗で音量を決める
  function volume() {
    const level = Number(slider.value);
    return MAX_VOLUME * level * level;
  }

  function play() {
    if (!ctx) {
      ctx = new AudioContextClass();
      ambient = createAmbient(ctx);
      ambient.output.connect(ctx.destination);
      ambient.start(ctx.currentTime);
    }
    clearTimeout(suspendTimer);
    ctx.resume().catch((error) => console.error("limen: 音楽を再生できません", error));
    ambient.fadeTo(volume(), FADE_IN);
    clearInterval(scheduler);
    scheduler = setInterval(() => ambient.schedule(ctx.currentTime + 4), 1000);
    ambient.schedule(ctx.currentTime + 4);
  }

  function pause() {
    if (!ctx) return;
    clearInterval(scheduler);
    ambient.fadeTo(0, FADE_OUT);
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => ctx.suspend(), FADE_OUT * 1000 + 200);
  }

  function load(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function store(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      // 保存できない環境では、読み込みのたびに初期状態から始まるだけ
    }
  }

  function save() {
    store(STORAGE_KEY, on ? "on" : "off");
  }

  function update() {
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "音楽を止める" : "音楽を流す";
  }

  button.addEventListener("click", () => {
    on = !on;
    save();
    update();
    if (on) play();
    else pause();
  });

  slider.addEventListener("input", () => {
    store(VOLUME_KEY, slider.value);
    if (on && ctx) ambient.fadeTo(volume(), 0.1);
  });

  document.addEventListener("visibilitychange", () => {
    if (!on || !ctx) return;
    if (document.hidden) pause();
    else play();
  });

  // 再読み込み後もオンを引き継ぐ。ブラウザは操作なしに音を出せないため、最初の操作で鳴らし始める
  const savedVolume = load(VOLUME_KEY);
  if (savedVolume !== null && Number(savedVolume) >= 0 && Number(savedVolume) <= 1) slider.value = savedVolume;

  if (load(STORAGE_KEY) === "on") {
    on = true;
    const gestures = ["pointerdown", "keydown"];
    const start = () => {
      gestures.forEach((type) => document.removeEventListener(type, start, true));
      if (on && !document.hidden) play();
    };
    gestures.forEach((type) => document.addEventListener(type, start, true));
  }

  update();
})();
