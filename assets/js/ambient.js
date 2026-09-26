(function () {
  "use strict";

  // 音量バーをいちばん上まで上げたときの音量。バーの初期位置（0.7）で、小さめの約 0.5 になる
  const MAX_VOLUME = 1;
  const FADE_IN = 2;
  const FADE_OUT = 1.5;

  // 長調とも短調ともつかない、五度を重ねた持続音（A2 D3 A3 E4）
  // ノートPC の内蔵スピーカーでも聞こえるよう、低すぎる音域は避けている
  const DRONE = [110.0, 146.83, 220.0, 329.63];
  // ときおり鳴る鈴の音（D4 E4 G4 A4 C5 D5）
  const BELLS = [293.66, 329.63, 392.0, 440.0, 523.25, 587.33];

  function pick(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function noiseBuffer(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function impulse(ctx, seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  function createAmbient(ctx) {
    const sources = [];
    const output = ctx.createGain();
    output.gain.value = 0;

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 5, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    reverb.connect(wet).connect(output);

    function lfo(frequency, depth) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = depth;
      osc.connect(gain);
      sources.push(osc);
      return gain;
    }

    // 持続音
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1100;
    padFilter.Q.value = 0.4;
    lfo(0.021, 350).connect(padFilter.frequency);
    padFilter.connect(output);
    padFilter.connect(reverb);

    DRONE.forEach((frequency, i) => {
      const voice = ctx.createGain();
      voice.gain.value = 0.045;
      lfo(0.03 + i * 0.011, 0.02).connect(voice.gain);
      [-5, 5].forEach((detune) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 ? "triangle" : "sine";
        osc.frequency.value = frequency;
        osc.detune.value = detune;
        osc.connect(voice);
        sources.push(osc);
      });
      voice.connect(padFilter);
    });

    // 遠い風
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(ctx, 4);
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 480;
    windFilter.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.012;
    lfo(0.047, 0.009).connect(windGain.gain);
    wind.connect(windFilter).connect(windGain);
    windGain.connect(reverb);
    sources.push(wind);

    // 鈴
    const bellDry = ctx.createGain();
    bellDry.gain.value = 0.6;
    bellDry.connect(output);

    function bell(at) {
      const frequency = pick(BELLS);
      const peak = 0.07 + Math.random() * 0.04;
      const decay = 4 + Math.random() * 3;

      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(peak, at + 0.05);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);

      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.2 - 0.6;
      envelope.connect(pan);
      pan.connect(bellDry);
      pan.connect(reverb);

      [
        [1, 1],
        [2.01, 0.22],
        [3.0, 0.06],
      ].forEach(([ratio, level]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency * ratio;
        const gain = ctx.createGain();
        gain.gain.value = level;
        osc.connect(gain).connect(envelope);
        osc.start(at);
        osc.stop(at + decay + 0.1);
      });
    }

    let nextBell = 0;

    return {
      output,
      start(at) {
        sources.forEach((source) => source.start(at));
        nextBell = at + 0.6;
      },
      // until（秒）までの鈴を予約する
      schedule(until) {
        while (nextBell < until) {
          bell(nextBell);
          nextBell += 3 + Math.random() * 6;
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

  // ---- オン/オフ（読み込み時は必ずオフ） ----

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

  function update() {
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "音楽を止める" : "音楽を流す";
  }

  button.addEventListener("click", () => {
    on = !on;
    update();
    if (on) play();
    else pause();
  });

  slider.addEventListener("input", () => {
    if (on && ctx) ambient.fadeTo(volume(), 0.1);
  });

  document.addEventListener("visibilitychange", () => {
    if (!on) return;
    if (document.hidden) pause();
    else play();
  });

  update();
})();
