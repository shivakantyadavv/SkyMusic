import { AtmosPreset } from "../types/music";

export interface AtmosPresetConfig {
  id: AtmosPreset;
  label: string;
  shortLabel: string;
  description: string;
}

export const ATMOS_PRESETS: AtmosPresetConfig[] = [
  {
    id: "music",
    label: "Auto / Music",
    shortLabel: "Music",
    description: "Balanced studio width, warm lows & vocal air",
  },
  {
    id: "movie",
    label: "Movie / 3D Surround",
    shortLabel: "3D Surround",
    description: "Expansive binaural soundstage & cinema depth",
  },
  {
    id: "bass",
    label: "Bass Boost",
    shortLabel: "Bass Boost",
    description: "Deep sub-bass punch with crisp dynamic control",
  },
  {
    id: "off",
    label: "Off",
    shortLabel: "Off",
    description: "Direct bit-transparent stereo output",
  },
];

interface PresetParams {
  subBassDb: number;
  lowMidDb: number;
  presenceDb: number;
  airDb: number;
  haasDelayLeftSec: number;
  haasDelayRightSec: number;
  haasCrossGain: number;
  convolverGain: number;
  panWidth: number;
  compThreshold: number;
  compRatio: number;
  makeupGain: number;
  irDuration: number;
  irDecay: number;
}

const PRESET_TUNINGS: Record<AtmosPreset, PresetParams> = {
  music: {
    subBassDb: 3.4,
    lowMidDb: 1.2,
    presenceDb: 2.2,
    airDb: 3.2,
    haasDelayLeftSec: 0.011,
    haasDelayRightSec: 0.015,
    haasCrossGain: 0.24,
    convolverGain: 0.14,
    panWidth: 0.12,
    compThreshold: -14,
    compRatio: 2.8,
    makeupGain: 1.06,
    irDuration: 0.52,
    irDecay: 3.6,
  },
  movie: {
    subBassDb: 4.5,
    lowMidDb: 0.8,
    presenceDb: 3.0,
    airDb: 4.2,
    haasDelayLeftSec: 0.016,
    haasDelayRightSec: 0.022,
    haasCrossGain: 0.36,
    convolverGain: 0.24,
    panWidth: 0.2,
    compThreshold: -15,
    compRatio: 3.4,
    makeupGain: 1.08,
    irDuration: 0.92,
    irDecay: 2.8,
  },
  bass: {
    subBassDb: 7.2,
    lowMidDb: 3.4,
    presenceDb: 1.4,
    airDb: 2.2,
    haasDelayLeftSec: 0.01,
    haasDelayRightSec: 0.014,
    haasCrossGain: 0.2,
    convolverGain: 0.1,
    panWidth: 0.08,
    compThreshold: -17,
    compRatio: 4.2,
    makeupGain: 1.02,
    irDuration: 0.42,
    irDecay: 4.0,
  },
  off: {
    subBassDb: 0,
    lowMidDb: 0,
    presenceDb: 0,
    airDb: 0,
    haasDelayLeftSec: 0.01,
    haasDelayRightSec: 0.01,
    haasCrossGain: 0,
    convolverGain: 0,
    panWidth: 0,
    compThreshold: -2,
    compRatio: 1,
    makeupGain: 1.0,
    irDuration: 0.4,
    irDecay: 4.0,
  },
};

/**
 * Generates a synthetic binaural early-reflection + diffuse studio room impulse
 * response buffer so the ConvolverNode operates 100% offline with zero asset loads.
 */
function buildSpatialImpulseResponse(
  ctx: AudioContext,
  durationSec: number,
  decay: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const preDelaySamples = Math.floor(sampleRate * 0.006);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = preDelaySamples; i < length; i++) {
    const t = (i - preDelaySamples) / Math.max(1, length - preDelaySamples);
    const envelope = Math.pow(1 - t, decay) * Math.min(1, (i - preDelaySamples) / 160);
    // Deterministic decorrelated pseudo-noise texture for left vs right ear cues
    const s1 = Math.sin(i * 0.371) * 0.5 + Math.cos(i * 0.913) * 0.35 + (Math.random() - 0.5) * 0.4;
    const s2 = Math.cos(i * 0.419) * 0.5 + Math.sin(i * 0.857) * 0.35 + (Math.random() - 0.5) * 0.4;
    left[i] = s1 * envelope * 0.36;
    right[i] = s2 * envelope * 0.36;
  }

  return buffer;
}

export class SpatialAudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private activePreset: AtmosPreset = "off";

  // Routing gain gates for click-free bypass vs Atmos DSP
  private bypassGain: GainNode | null = null;
  private dspInputGain: GainNode | null = null;
  private masterOutGain: GainNode | null = null;

  // Multi-band EQ
  private subBassFilter: BiquadFilterNode | null = null;
  private lowMidFilter: BiquadFilterNode | null = null;
  private presenceFilter: BiquadFilterNode | null = null;
  private airFilter: BiquadFilterNode | null = null;

  // Binaural Haas widener & stereo stage
  private haasDelayL: DelayNode | null = null;
  private haasDelayR: DelayNode | null = null;
  private haasGainL: GainNode | null = null;
  private haasGainR: GainNode | null = null;
  private stereoPannerL: StereoPannerNode | null = null;
  private stereoPannerR: StereoPannerNode | null = null;

  // Acoustic convolver & dynamics protection
  private convolver: ConvolverNode | null = null;
  private convolverGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  public attach(element: HTMLAudioElement): void {
    if (this.attachedElement === element && this.ctx) {
      return;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioCtx) return;

    const ctx = this.ctx || new AudioCtx();
    this.ctx = ctx;

    if (!this.sourceNode) {
      this.sourceNode = ctx.createMediaElementSource(element);
      this.attachedElement = element;
      this.buildGraph(ctx, this.sourceNode);
    }

    this.applyPreset(this.activePreset);
  }

  private buildGraph(
    ctx: AudioContext,
    source: MediaElementAudioSourceNode
  ): void {
    const bypassGain = ctx.createGain();
    const dspInputGain = ctx.createGain();
    const masterOutGain = ctx.createGain();

    // Direct clean bypass branch
    source.connect(bypassGain);
    bypassGain.connect(ctx.destination);

    // Multi-band EQ chain
    const subBass = ctx.createBiquadFilter();
    subBass.type = "lowshelf";
    subBass.frequency.value = 65;

    const lowMid = ctx.createBiquadFilter();
    lowMid.type = "peaking";
    lowMid.frequency.value = 160;
    lowMid.Q.value = 0.85;

    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 2800;
    presence.Q.value = 1.05;

    const air = ctx.createBiquadFilter();
    air.type = "highshelf";
    air.frequency.value = 10000;

    source.connect(dspInputGain);
    dspInputGain.connect(subBass);
    subBass.connect(lowMid);
    lowMid.connect(presence);
    presence.connect(air);

    // Direct stereo path + Binaural Haas Cross-Feed + Convolver + Compressor
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1;
    air.connect(dryGain);

    const splitter = ctx.createChannelSplitter(2);
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();

    const delayL = ctx.createDelay(0.1);
    const delayR = ctx.createDelay(0.1);
    const crossGainL = ctx.createGain();
    const crossGainR = ctx.createGain();

    air.connect(splitter);

    // Subtle cross-ear binaural Haas reflections (opposite ear cues panned wide)
    splitter.connect(delayL, 1);
    delayL.connect(crossGainL);
    crossGainL.connect(panL);

    splitter.connect(delayR, 0);
    delayR.connect(crossGainR);
    crossGainR.connect(panR);

    // Subtle overhead/studio Convolver branch
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = buildSpatialImpulseResponse(ctx, 0.65, 3.2);
    const convolverGain = ctx.createGain();
    air.connect(convolver);
    convolver.connect(convolverGain);

    // Dynamics Compressor & Output Gain
    const compressor = ctx.createDynamicsCompressor();
    compressor.attack.value = 0.008;
    compressor.release.value = 0.2;
    compressor.knee.value = 14;

    dryGain.connect(compressor);
    panL.connect(compressor);
    panR.connect(compressor);
    convolverGain.connect(compressor);
    compressor.connect(masterOutGain);
    masterOutGain.connect(ctx.destination);

    this.bypassGain = bypassGain;
    this.dspInputGain = dspInputGain;
    this.masterOutGain = masterOutGain;
    this.subBassFilter = subBass;
    this.lowMidFilter = lowMid;
    this.presenceFilter = presence;
    this.airFilter = air;
    this.haasDelayL = delayL;
    this.haasDelayR = delayR;
    this.haasGainL = crossGainL;
    this.haasGainR = crossGainR;
    this.stereoPannerL = panL;
    this.stereoPannerR = panR;
    this.convolver = convolver;
    this.convolverGain = convolverGain;
    this.compressor = compressor;
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // Ignore resume restriction until user gesture
      }
    }
  }

  public applyPreset(preset: AtmosPreset): void {
    this.activePreset = preset;
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const ramp = 0.035;
    const tuning = PRESET_TUNINGS[preset];
    const isOff = preset === "off";

    this.bypassGain?.gain.setTargetAtTime(isOff ? 1 : 0, now, ramp);
    this.dspInputGain?.gain.setTargetAtTime(isOff ? 0 : 1, now, ramp);
    this.masterOutGain?.gain.setTargetAtTime(
      isOff ? 0 : tuning.makeupGain,
      now,
      ramp
    );

    if (!isOff && this.convolver) {
      this.convolver.buffer = buildSpatialImpulseResponse(
        this.ctx,
        tuning.irDuration,
        tuning.irDecay
      );
    }

    this.subBassFilter?.gain.setTargetAtTime(tuning.subBassDb, now, ramp);
    this.lowMidFilter?.gain.setTargetAtTime(tuning.lowMidDb, now, ramp);
    this.presenceFilter?.gain.setTargetAtTime(tuning.presenceDb, now, ramp);
    this.airFilter?.gain.setTargetAtTime(tuning.airDb, now, ramp);

    this.haasDelayL?.delayTime.setTargetAtTime(
      tuning.haasDelayLeftSec,
      now,
      ramp
    );
    this.haasDelayR?.delayTime.setTargetAtTime(
      tuning.haasDelayRightSec,
      now,
      ramp
    );
    this.haasGainL?.gain.setTargetAtTime(tuning.haasCrossGain, now, ramp);
    this.haasGainR?.gain.setTargetAtTime(tuning.haasCrossGain, now, ramp);
    this.stereoPannerL?.pan.setTargetAtTime(
      Math.max(-1, -0.65 - tuning.panWidth),
      now,
      ramp
    );
    this.stereoPannerR?.pan.setTargetAtTime(
      Math.min(1, 0.65 + tuning.panWidth),
      now,
      ramp
    );

    this.convolverGain?.gain.setTargetAtTime(tuning.convolverGain, now, ramp);
    this.compressor?.threshold.setTargetAtTime(tuning.compThreshold, now, ramp);
    this.compressor?.ratio.setTargetAtTime(tuning.compRatio, now, ramp);
  }

  public getPreset(): AtmosPreset {
    return this.activePreset;
  }

  public destroy(): void {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.sourceNode = null;
    this.attachedElement = null;
  }
}

export const spatialAudio = new SpatialAudioEngine();
