export type LocalToolResult = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type LocalToolCallOptions = {
  signal?: AbortSignal;
  notify?: (message: string) => void;
};

export declare function callLocalToolResult(
  operation: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
  options?: LocalToolCallOptions,
): Promise<LocalToolResult>;

export declare function callLocalTool(
  operation: string,
  args: Record<string, unknown>,
  timeoutMs?: number,
): Promise<string>;
