import { Config } from '../src/core/config/Config';
import { EventBus } from '../src/core/messaging/EventBus';
import { AgentManager } from '../src/core/agent/AgentManager';
import { EmbodiedAgent } from '../src/core/agent/EmbodiedAgent';
import { AgentType } from '../src/core/agent/BaseAgent';

/**
 * 模擬 Minecraft CodeSkill Agent
 */
async function runDemo() {
    console.log('[Demo] Initializing CodeSkill Agent...');
    
    const config = new Config();
    const eventBus = new EventBus(config);
    // 假設我們有其他基礎依賴...
    
    // 初始化 EmbodiedAgent
    const agent = new EmbodiedAgent('mc_bot_01', 'session_01', {
        config,
        eventBus,
        llmProvider: {} as any, 
        workspaceManager: {} as any,
        logManager: {} as any
    });

    // 1. 初始化狀態
    console.log('[Demo] Registering initial states...');
    agent.stateRegistry.register('health', 20, 'Current HP. Max 20.');
    agent.stateRegistry.register('mode', 'IDLE', 'Current mode (IDLE, COMBAT, FARMING)');

    console.log('[Demo] Current State Dump:');
    console.log(agent.stateRegistry.exportSummary());

    // 2. 這邊可以串接 BotManager，並實例化 CreateCodeSkillTool 與 ExecuteCodeSkillTool
    // 並透過 eventBus 把使用者的訊息發給 Agent
    console.log('[Demo] Ready to receive CodeSkill commands via EventBus!');
}

runDemo().catch(console.error);
