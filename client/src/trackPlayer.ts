// 8-bit track player — plays track data from the DB via Web Audio API.
export interface TrackData {
  bpm: number;
  lead: [number, number][];  // [freq Hz, beats]
  bass: [number, number][];
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
