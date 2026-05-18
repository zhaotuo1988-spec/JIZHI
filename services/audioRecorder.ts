
// WAV 文件头封装工具
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};

const encodeWAV = (samples: Float32Array, sampleRate: number) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * 2, true);

  floatTo16BitPCM(view, 44, samples);

  return view;
};

export class WavRecorder {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private scriptProcessor: ScriptProcessorNode | null = null;
    private audioInput: MediaStreamAudioSourceNode | null = null;
    private audioData: Float32Array[] = [];
    private streamStreaming = false;

    async start() {
        this.audioData = [];
        this.streamStreaming = true;
        
        // 兼容处理
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextClass();
        
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error("Microphone Access Failed", e);
            throw new Error("无法访问麦克风");
        }
        
        this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // 使用 ScriptProcessorNode 进行音频采集 (Buffer: 4096, In: 1, Out: 1)
        // 虽然 AudioWorklet 是新标准，但 ScriptProcessor 兼容性更好且无需额外文件
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.scriptProcessor.onaudioprocess = (e) => {
            if (!this.streamStreaming) return;
            const inputBuffer = e.inputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            // 克隆数据，因为 inputData 在下次回调会被复用
            this.audioData.push(new Float32Array(inputData));
        }

        this.audioInput.connect(this.scriptProcessor);
        this.scriptProcessor.connect(this.audioContext.destination);
    }

    async stop(): Promise<Blob> {
        this.streamStreaming = false;
        
        // 停止流
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // 断开连接
        if (this.audioInput) this.audioInput.disconnect();
        if (this.scriptProcessor) this.scriptProcessor.disconnect();
        
        // 合并 Buffer
        const totalLength = this.audioData.reduce((acc, curr) => acc + curr.length, 0);
        const result = new Float32Array(totalLength);
        let offset = 0;
        for (const buffer of this.audioData) {
            result.set(buffer, offset);
            offset += buffer.length;
        }
        
        // 编码为 WAV
        const sampleRate = this.audioContext?.sampleRate || 44100;
        const wavView = encodeWAV(result, sampleRate);
        
        // 关闭 Context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            await this.audioContext.close();
        }
        
        return new Blob([wavView], { type: 'audio/wav' });
    }
}

export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
};
