import { MobController, RpcClient } from './novalink-sdk';

const client = new RpcClient();
const wolf = new MobController(client, "7e6409a0-c126-4eca-bee4-1cd026062c3c");

wolf.say("test.");

// 加上 onReady isReady

