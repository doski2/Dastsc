import '@testing-library/jest-dom';

// Mock de WebSocket para las pruebas
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  readyState: number = 0; // CONNECTING

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(_data: string) {}
  close() {
    this.readyState = 3; // CLOSED
    setTimeout(() => {
      if (this.onclose) this.onclose();
    }, 10);
  }
}

globalThis.WebSocket = MockWebSocket as any;
