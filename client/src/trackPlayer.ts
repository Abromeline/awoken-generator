// 8-bit track player — plays track data from the DB via Web Audio API.
export interface TrackData {
  bpm: number;
  lead: [number, number][];  // [freq Hz, beats]
  bass: [number, number][];
  violin?: [number, number][];  // sorrowful violin counter-melody
  drums: string;
}

export class TrackPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing = false;
  private timers: number[] = [];

  async play(trackData: TrackData) {
    this.stop();
    this.ctx = new AudioContext();
    // iOS requires resume() from user gesture context
    if (this.ctx.state === "suspended") {
      await this.ctx.resume().catch(() => {});
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.12;
    this.master.connect(this.ctx.destination);
    this.playing = true;
    this.loopTrack(trackData);
  }

  stop() {
    this.playing = false;
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }

  private loopTrack(data: TrackData) {
    if (!this.playing) return;
    const beatMs = 60000 / data.bpm;
    let time = 0;

    // Schedule lead
    data.lead.forEach(([freq, beats]) => {
      if (freq > 0) {
        this.timers.push(window.setTimeout(() => this.playNote(freq, beats * beatMs * 0.9, "square", 0.4), time));
      }
      time += beats * beatMs;
    });
    const leadDuration = time;

    // Schedule bass
    time = 0;
    data.bass.forEach(([freq, beats]) => {
      if (freq > 0) {
        this.timers.push(window.setTimeout(() => this.playNote(freq, beats * beatMs * 0.9, "triangle", 0.5), time));
      }
      time += beats * beatMs;
    });

    // Schedule violin (sorrowful: sawtooth + vibrato, slow attack)
    if (data.violin) {
      time = 0;
      data.violin.forEach(([freq, beats]) => {
        if (freq > 0) {
          const startAt = time;
          const durMs = beats * beatMs * 0.95;
          this.timers.push(window.setTimeout(() => this.playViolin(freq, durMs), startAt));
        }
        time += beats * beatMs;
      });
    }

    // Schedule drums
    this.scheduleDrums(data.drums, beatMs);

    // Loop
    const loopLen = Math.max(leadDuration, time);
    this.timers.push(window.setTimeout(() => this.loopTrack(data), loopLen + 100));
  }

  private playNote(freq: number, durationMs: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.master || !this.playing) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + durationMs / 1000);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.05);
  }

  private playViolin(freq: number, durationMs: number) {
    if (!this.ctx || !this.master || !this.playing) return;
    const t = this.ctx.currentTime;
    const dur = durationMs / 1000;
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    // Vibrato: 5.5Hz, ±15 cents
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.008;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    const g = this.ctx.createGain();
    // Slow attack (0.3s), sustain, gentle release
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.22, t + Math.min(0.3, dur * 0.3));
    g.gain.setValueAtTime(0.22, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.01, t + dur);
    // Lowpass to soften the sawtooth into strings
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 2200;
    osc.connect(f);
    f.connect(g);
    g.connect(this.master);
    osc.start(t);
    vib.start(t);
    osc.stop(t + dur + 0.05);
    vib.stop(t + dur + 0.05);
  }

  private scheduleDrums(pattern: string, beatMs: number) {
    const parts = pattern.split("-");
    parts.forEach((p, i) => {
      const t = i * beatMs * 0.5;
      if (p.includes("kick")) {
        this.timers.push(window.setTimeout(() => this.noiseBurst(0.08, 800), t));
      }
      if (p.includes("snare")) {
        this.timers.push(window.setTimeout(() => this.noiseBurst(0.06, 2000), t));
      }
      if (p.includes("hat")) {
        this.timers.push(window.setTimeout(() => this.noiseBurst(0.03, 6000), t));
      }
    });
  }

  private noiseBurst(duration: number, filterFreq: number) {
    if (!this.ctx || !this.master || !this.playing) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * duration);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.01, t + duration);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }
}

export const trackPlayer = new TrackPlayer();
