/**
 * @file RpcClient.ts
 * 負責底層的 WebSocket 連線與 JSON-RPC 2.0 訊息解析。
 * 將非同步回呼 (Callback) 封裝為 Promise，提供給高階 Controller 使用。
 */

export type EventHandler = (params: any) => void;

export class RpcClient {
    private ws: WebSocket;
    private messageId = 1;
    private pendingRequests = new Map<number, { resolve: (val: any) => void, reject: (err: any) => void }>();
    private eventHandlers = new Map<string, Set<EventHandler>>();

    /**
     * 建立 RPC 通訊客戶端
     * @param url WebSocket 伺服器網址 (預設為 ws://127.0.0.1:8080)
     */
    constructor(url: string = 'ws://127.0.0.1:8080') {
        this.ws = new WebSocket(url);
        
        this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
        
        this.ws.addEventListener('open', () => {
            console.log('✅ [RpcClient] Connected to Server');
        });
        
        this.ws.addEventListener('close', () => {
            console.log('❌ [RpcClient] Disconnected');
            // 清理未完成的 Promise
            this.pendingRequests.forEach(req => req.reject(new Error("WebSocket closed")));
            this.pendingRequests.clear();
        });
        
        this.ws.addEventListener('error', (err) => {
            console.error('⚠️ [RpcClient] WebSocket Error:', err);
        });
    }

    /**
     * 等待 WebSocket 連線完全建立
     */
    public async waitForConnection(): Promise<void> {
        if (this.ws.readyState === WebSocket.OPEN) return;
        return new Promise((resolve, reject) => {
            const onOpen = () => {
                this.ws.removeEventListener('open', onOpen);
                this.ws.removeEventListener('error', onError);
                resolve();
            };
            const onError = (err: any) => {
                this.ws.removeEventListener('open', onOpen);
                this.ws.removeEventListener('error', onError);
                reject(err);
            };
            this.ws.addEventListener('open', onOpen);
            this.ws.addEventListener('error', onError);
        });
    }

    /**
     * 發送 JSON-RPC 2.0 請求
     * @param method 方法名稱 (例如 "mob.moveTo")
     * @param params JSON 參數物件
     * @returns 該次 RPC 呼叫的回傳結果 (Result)
     */
    public async call<T>(method: string, params: Record<string, any> = {}): Promise<T> {
        return new Promise((resolve, reject) => {
            if (this.ws.readyState !== WebSocket.OPEN) {
                return reject(new Error("WebSocket is not open"));
            }

            const id = this.messageId++;
            this.pendingRequests.set(id, { resolve, reject });
            
            this.ws.send(JSON.stringify({
                jsonrpc: "2.0",
                method,
                params,
                id
            }));
        });
    }

    /**
     * 訂閱由伺服器主動發起的事件通知 (Notification)
     * @param eventName 事件名稱 (例如 "entity_hurt")
     * @param handler 接收到事件時的回呼函式
     */
    public onEvent(eventName: string, handler: EventHandler) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, new Set());
        }
        this.eventHandlers.get(eventName)!.add(handler);
    }

    private handleMessage(data: string | Buffer | ArrayBuffer) {
        try {
            const response = JSON.parse(data.toString());
            
            if (response.id !== undefined) {
                // 處理 RPC 請求的回應 (Response)
                const pending = this.pendingRequests.get(response.id);
                if (pending) {
                    if (response.error) pending.reject(response.error);
                    else pending.resolve(response.result);
                    this.pendingRequests.delete(response.id);
                }
            } 
            else if (response.method && response.method.startsWith('event.')) {
                // 處理伺服器主動發送的通知 (Notification)
                const eventName = response.method.substring(6);
                const handlers = this.eventHandlers.get(eventName);
                if (handlers && handlers.size > 0) {
                    handlers.forEach(fn => fn(response.params));
                }
            }
        } catch (e) {
            console.error('[RpcClient] Failed to parse message:', e);
        }
    }
}
