import { AgentRegistry } from '../src/infra/AgentRegistry';
import { ToolRegistry } from '../src/infra/ToolRegistry';
import { SessionManager } from '../src/infra/SessionManager';
import { EventBus } from '../src/infra/EventBus';
import { CapabilityValidator } from '../src/infra/CapabilityValidator';
import { FileSnapshotManager } from '../src/infra/FileSnapshotManager';
import { BaseAgent } from '../src/agent/BaseAgent';
import { BaseTool } from '../src/tool/BaseTool';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IEvent } from '../interfaces/models/IEvent';
import type { ISession } from '../interfaces/session/ISession';

describe('Infra Theme Tests', () => {

  describe('AgentRegistry', () => {
    let registry: AgentRegistry;
    beforeEach(() => { registry = new AgentRegistry(); });

    test('should register and retrieve an agent', async () => {
      const agent = new BaseAgent();
      await agent.initFromJSON({ id: 'test-agent', role: 'tester' });
      registry.register(agent);
      expect(registry.getAgent('test-agent')).toBe(agent);
    });

    test('should load agent from JSON', async () => {
      const agent = await registry.loadAgentFromJSON({ id: 'j1', role: 'r1', type: 'BASE' });
      expect(agent.id).toBe('j1');
      expect(registry.getAgent('j1')).toBe(agent);
    });
  });

  describe('ToolRegistry', () => {
    let registry: ToolRegistry;
    beforeEach(() => { registry = new ToolRegistry(); });

    test('should register and retrieve a tool', () => {
      const mockTool = { name: 't1', description: 'd1', safety_tier: 'TIER_1' } as any;
      registry.register(mockTool);
      expect(registry.getTool('t1')).toBe(mockTool);
    });
  });

  describe('SessionManager', () => {
    let manager: SessionManager;
    beforeEach(() => { manager = new SessionManager(); });

    it('should create and manage sessions', async () => {
      const session = await manager.createFromJSON({ id: 's1', goal: 'g1' });
      expect(manager.getSession('s1')).toBe(session);
      manager.deleteSession('s1');
      expect(manager.getSession('s1')).toBeUndefined();
    });
  });

  describe('EventBus', () => {
    let eventBus: EventBus;
    beforeEach(() => { eventBus = new EventBus(); });

    test('should notify subscribers', () => {
      const handler = jest.fn();
      const event: IEvent = { type: 'T1', payload: {}, tags: [], trace_context: { session_id: 's', trace_id: 't' } };
      eventBus.subscribe('T1', handler);
      eventBus.publish(event);
      expect(handler).toHaveBeenCalledWith(event);
    });
  });

  describe('CapabilityValidator', () => {
    test('should validate agent capabilities against tool requirements', async () => {
      const tool = { required_capabilities: ['ADMIN'] } as any;
      const agent = new BaseAgent();
      
      await agent.initFromJSON({ capabilities: ['USER'] });
      expect(CapabilityValidator.validate(agent, tool)).toBe(false);

      await agent.initFromJSON({ capabilities: ['ADMIN', 'USER'] });
      expect(CapabilityValidator.validate(agent, tool)).toBe(true);
    });
  });

  describe('FileSnapshotManager', () => {
    const testStorageDir = path.join(process.cwd(), '.test-snapshots-theme');
    let manager: FileSnapshotManager;

    beforeEach(async () => {
      manager = new FileSnapshotManager(testStorageDir);
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
    });

    afterAll(async () => {
      if (await fs.access(testStorageDir).then(() => true).catch(() => false)) {
        await fs.rm(testStorageDir, { recursive: true, force: true });
      }
    });

    it('should create a snapshot file correctly', async () => {
      const mockSession = {
        id: 'session-1',
        toJSON: () => ({ id: 'session-1', data: 'test' }),
        loadFromJSON: async () => {}
      } as unknown as ISession;

      const snapshotId = await manager.snapshot(mockSession, { lastTaskId: 'task-1' });
      
      expect(snapshotId).toBeDefined();
      const filePath = path.join(testStorageDir, 'session-1', `${snapshotId}.json`);
      const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      expect(content.session.id).toBe('session-1');
      expect(content.metadata.lastTaskId).toBe('task-1');
    });

    it('should retrieve the latest snapshot ID', async () => {
      const mockSession = {
        id: 'session-2',
        toJSON: () => ({ id: 'session-2' }),
        loadFromJSON: async () => {}
      } as unknown as ISession;

      await manager.snapshot(mockSession, { taskIndex: 1 });
      const id2 = await manager.snapshot(mockSession, { taskIndex: 2 });

      const latest = await manager.getLatestSnapshotId('session-2');
      expect(latest).toBe(id2);
    });
  });

  describe('BaseTool', () => {
    class MockTool extends BaseTool<{ value: number }, { result: number }> {
      constructor() {
        super('MT', 'desc', 'TIER_1', ['cap']);
      }
      async run(input: { value: number }) { return { result: input.value * 2 }; }
    }

    it('should initialize correctly', () => {
      const tool = new MockTool();
      expect(tool.name).toBe('MT');
      expect(tool.required_capabilities).toContain('cap');
    });

    it('should default validateInput to true', async () => {
      const tool = new MockTool();
      const isValid = await tool.validateInput({ value: 10 });
      expect(isValid).toBe(true);
    });

    it('should allow overriding validateInput', async () => {
      class CustomValidateTool extends MockTool {
        async validateInput(input: { value: number }): Promise<boolean> {
          return input.value > 0;
        }
      }
      const tool = new CustomValidateTool();
      expect(await tool.validateInput({ value: 10 })).toBe(true);
      expect(await tool.validateInput({ value: -1 })).toBe(false);
    });
  });
});
