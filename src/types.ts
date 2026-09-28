export type ImageQuality = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Draft = { prompt: string; referenceIds: string[]; count: number; quality?: ImageQuality };
export type Asset = { deletedAt?: string; id: string; name: string; mime: string; width: number; height: number; createdAt: string; url: string; thumbnail: string };
export type Setup = { id: string; name: string; draft: Draft; createdAt: string };
export type Job = { hiddenAt?: string; id: string; index: number; status: 'queued' | 'generating' | 'succeeded' | 'failed' | 'interrupted'; assetId?: string; error?: string };
export type Run = { kind?: 'upscale'; generatorTabId?: string; upscaleFactor?: number; falRequest?: {id:string;statusURL:string;responseURL:string}; sourceAssetId?: string; inputPercent?: number; id: string; draft: Draft; createdAt: string; jobs: Job[]; label?: string };
export type StudioState = { draft: Draft; assets: Record<string, Asset>; setups: Setup[]; runs: Run[] };
export type Connection = { connected: boolean; message: string; verified: boolean };
