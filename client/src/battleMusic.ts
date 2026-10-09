// 8-bit Unraveling battle theme — procedural chiptune via Web Audio API.
// High stakes, fast paced. Minor key, 140 BPM.
export class BattleMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private playing = false;
  private step = 0;
  private timer: number | null = null;

  // A minor: A, C, E. Fast arpeggio + driving bass.
  private leadNotes = [
    440, 523.25, 659.25, 523.25, // A4, C5, E5, C5
    440, 523.25, 659.25, 880,    // A4, C5, E5, A5
    659.25, 523.25, 440, 523.25, // E5, C5, A4, C5
    392, 440, 523.25, 440,       // G4, A4, C5, A4
  ];
  private bassNotes = [
    110, 110, 130.81, 110, // A2, A2, C3, A2
    98, 110, 130.81, 146.83, // G2, A2, C3, D3
  ];

  start() {
    if (this.playing) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.15;
    this.master.connect(this.ctx.destination);
    this.playing = true;
    this.step = 0;
    // 140 BPM, 16th notes = 107ms per step
    this.timer = window.setInterval(() => this.playStep(), 107);
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this.timer) clearInterval(this.timer);
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }

  private playStep() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;

    // Lead: square wave arpeggio
    const leadFreq = this.leadNotes[this.step % this.leadNotes.length];
    const lead = this.ctx.createOscillator();
    lead.type = "square";
    lead.frequency.value = leadFreq;
    const leadGain = this.ctx.createGain();
    leadGain.gain.setValueAtTime(0.5, t);
    leadGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    lead.connect(leadGain);
    leadGain.connect(this.master);
    lead.start(t);
    lead.stop(t + 0.11);

    // Bass: triangle wave, every 2 steps
    if (this.step % 2 === 0) {
      const bassFreq = this.bassNotes[(this.step / 2) % this.bassNotes.length];
      const bass = this.ctx.createOscillator();
      bass.type = "triangle";
      bass.frequency.value = bassFreq;
      const bassGain = this.ctx.createGain();
      bassGain.gain.setValueAtTime(0.6, t);
      bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
      bass.connect(bassGain);
      bassGain.connect(this.master);
      bass.start(t);
      bass.stop(t + 0.21);
    }

    // Drums: noise burst every 4 steps (kick), hi-hat every 2
    if (this.step % 4 === 0) {
      this.noiseBurst(t, 0.05, 1000); // Kick
    }
    if (this.step % 2 === 1) {
      this.noiseBurst(t, 0.03, 6000); // Hi-hat
    }

    this.step++;
  }

  private noiseBurst(t: number, duration: number, filterFreq: number) {
    if (!this.ctx || !this.master) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    noise.start(t);
  }
}

export const battleMusic = new BattleMusic();
