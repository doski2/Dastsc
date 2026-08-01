export interface CommandAck {
  ok: boolean;
  command?: string;
  value?: number;
  error?: string;
  line?: string;
}
