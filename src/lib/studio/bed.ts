/** A quiet rhythmic bed. Runs in the browser so a preview does not spend a music model. */
export class Bed {
  private ctx: AudioContext;
  private duck: GainNode;
  private master: GainNode;
  private timer: number | null = null;
  private next = 0;
  private stepIndex = 0;
  private bpm = 104;
  private stopped = true;

  constructor(ctx?: AudioContext, extra?: AudioNode) {
    this.ctx = ctx ?? new AudioContext();
    this.duck = this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.16;
    this.duck.connect(this.master);
    this.master.connect(this.ctx.destination);
    if (extra) this.master.connect(extra);
  }

  get context() {
    return this.ctx;
  }

  setDucked(on: boolean) {
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.linearRampToValueAtTime(on ? 0.28 : 1, t + 0.08);
  }

  start(bpm: number) {
    this.bpm = Math.min(140, Math.max(70, bpm));
    this.stopped = false;
    this.next = this.ctx.currentTime + 0.05;
    this.stepIndex = 0;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.schedule();
    if (this.timer) window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  stop() {
    this.stopped = true;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 0.05);
  }

  private schedule() {
    if (this.stopped) return;
    const step = 60 / this.bpm / 2;
    while (this.next < this.ctx.currentTime + 0.25) {
      this.blip(this.next, this.stepIndex);
      this.stepIndex += 1;
      this.next += step;
    }
  }

  private blip(time: number, index: number) {
    const scale = [196, 247, 294, 330, 392];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = index % 4 === 0 ? "triangle" : "sine";
    osc.frequency.value = scale[index % scale.length] ?? 247;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(index % 2 === 0 ? 0.22 : 0.1, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    osc.connect(gain);
    gain.connect(this.duck);
    osc.start(time);
    osc.stop(time + 0.2);

    if (index % 2 === 0) {
      const noise = this.ctx.createBufferSource();
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      noise.buffer = buffer;
      const ng = this.ctx.createGain();
      ng.gain.value = 0.05;
      noise.connect(ng);
      ng.connect(this.duck);
      noise.start(time);
    }
  }
}
