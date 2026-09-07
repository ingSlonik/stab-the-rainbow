declare const THREE: any;

declare module 'ect-bin' {
  const ectPath: string;
  export default ectPath;
}

declare module 'roadroller' {
  export class Packer {
    constructor(inputs: any[], options?: any);
    optimize(level?: number): Promise<any>;
    makeDecoder(): { firstLine: string; secondLine: string };
  }
}

interface Window {
  THREE: any;
  webkitAudioContext?: typeof AudioContext;
}
