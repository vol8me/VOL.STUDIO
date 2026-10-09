export interface PreviewServer {
  pid: number;
  stop(): Promise<void>;
}

export function startPreview(options: {
  cwd: string;
  port: number;
  entry?: string;
}): Promise<PreviewServer>;

export function previewReady(output: string, port: number): boolean;
