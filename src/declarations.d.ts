declare const AFRAME: any;
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
  AFRAME: any;
  THREE: any;
  webkitAudioContext?: typeof AudioContext;
  bootGame?: () => void;
  _g?: any;
}
