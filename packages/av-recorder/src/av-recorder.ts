import { Log, EventTool } from '@webav/av-cliper';
import MuxMP4Worker from './mux-mp4-worker?worker&inline';
import { EWorkerMsg, IRecorderConf, IStream, IWorkerOpts } from './types';

type TState = 'inactive' | 'recording' | 'paused' | 'stopped';
export class AVRecorder {
  #state: TState = 'inactive';
  get state(): TState {
    return this.#state;
  }
  set state(_: TState) {
    throw new Error('state is readonly');
  }

  #evtTool = new EventTool<{
    stateChange: (state: TState) => void;
  }>();
  on = this.#evtTool.on;

  #ms;

  #conf: Required<IRecorderConf>;

  #worker: Worker | null = null;

  outputStream: ReadableStream<Uint8Array> | null = null;

  constructor(inputMediaStream: MediaStream, conf: IRecorderConf = {}) {
    this.#ms = inputMediaStream;
    this.#conf = {
      width: 0,
      height: 0,
      bitrate: 3_000_000,
      expectFPS: 30,
      audioCodec: 'aac',
      videoCodec: 'avc1.42E032',
      ...conf,
    };
  }

  async start(timeSlice: number = 500): Promise<void> {
    Log.info('AVRecorder.start recoding');
    const worker = new MuxMP4Worker();
    this.#worker = worker;

    const streams: IStream = {};
    const videoTrack = this.#ms.getVideoTracks()[0];
    let videoConf: IWorkerOpts['video'] | null = null;
    if (videoTrack != null) {
      const settings = videoTrack.getSettings();
      videoConf = {
        width: this.#conf.width || settings.width || 1280,
        height: this.#conf.height || settings.height || 720,
        expectFPS: this.#conf.expectFPS,
        codec: this.#conf.videoCodec,
      };
      streams.video = new MediaStreamTrackProcessor({
        track: videoTrack,
      }).readable;
    }

    const audioTrack = this.#ms.getAudioTracks()[0];
    let audioConf: IWorkerOpts['audio'] | null = null;
    if (audioTrack != null) {
      const settings = audioTrack.getSettings();
      audioConf = {
        codec: this.#conf.audioCodec,
        sampleRate: settings.sampleRate ?? 0,
        channelCount: settings.channelCount ?? 0,
      };
      Log.info('AVRecorder recording audioConf:', audioConf);
      streams.audio = new MediaStreamTrackProcessor({
        track: audioTrack,
      }).readable;
    }

    if (streams.audio == null && streams.video == null) {
      throw new Error('No available tracks in MediaStream');
    }

    const workerOpts: IWorkerOpts = {
      video: videoConf,
      audio: audioConf,
      bitrate: this.#conf.bitrate,
      timeSlice,
      streams,
    };

    worker.postMessage(
      {
        type: EWorkerMsg.Start,
        data: workerOpts,
      },
      Object.values(streams),
    );

    return await new Promise<void>((resolve) => {
      worker.addEventListener('message', (evt: MessageEvent) => {
        const { type, data } = evt.data;
        switch (type) {
          case EWorkerMsg.OutputStream:
            this.#state = 'recording';
            this.#evtTool.emit('stateChange', this.#state);
            this.outputStream = data;
            resolve();
            break;
        }
      });
    });
  }

  pause(): void {
    this.#state = 'paused';
    this.#evtTool.emit('stateChange', this.#state);
    this.#worker?.postMessage({ type: EWorkerMsg.Paused, data: true });
  }
  resume(): void {
    this.#state = 'recording';
    this.#evtTool.emit('stateChange', this.#state);
    this.#worker?.postMessage({ type: EWorkerMsg.Paused, data: false });
  }

  async stop(): Promise<void> {
    this.#state = 'stopped';
    const worker = this.#worker;
    if (worker == null) return;

    worker.postMessage({ type: EWorkerMsg.Stop });
    return await new Promise<void>((resolve) => {
      worker.addEventListener('message', (evt: MessageEvent) => {
        const { type } = evt.data;
        switch (type) {
          case EWorkerMsg.SafeExit:
            worker.terminate();
            this.#ms.getTracks().forEach((track) => {
              track.stop();
            });
            this.outputStream = null;
            resolve();
            this.#evtTool.emit('stateChange', this.#state);
            break;
        }
      });
    });
  }
}
