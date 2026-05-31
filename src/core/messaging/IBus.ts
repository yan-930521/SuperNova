/**
 * 基礎指令介面
 */
export interface ICommand {
  readonly type: string;
}

/**
 * 基礎事件介面
 */
export interface IEvent {
  readonly type: string;
  readonly timestamp: number;
}

/**
 * 指令總線介面，用於發送指令並處理回應
 */
export interface ICommandBus {
  send<T = any>(command: ICommand): Promise<T>;
  registerHandler(type: string, handler: (command: any) => Promise<any>): void;
}

/**
 * 事件總線介面，用於發佈事件與訂閱
 */
export interface IEventBus {
  publish(event: IEvent): void;
  subscribe(type: string, handler: (event: any) => void): void;
}
