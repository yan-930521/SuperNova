import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FileSystemMemoryRepository } from '../FileSystemMemoryRepository';
import { MemoryDTO, MemoryLayer } from '../../../types/memory';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('FileSystemMemoryRepository', () => {
  let tempDir: string;
  let repo: FileSystemMemoryRepository;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `supernova-test-memory-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    repo = new FileSystemMemoryRepository(tempDir);
    await repo.initialize();
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  const createMemory = (id: string, sessionId: string, layer: MemoryLayer): MemoryDTO => ({
    id,
    sessionId,
    layer,
    authorId: 'test-agent',
    timestamp: Date.now(),
    data: { test: 'data' }
  });

  it('should save and find memories by session', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    const mem2 = createMemory('mem2', 'session-b', MemoryLayer.L1);

    await repo.save(mem1);
    await repo.save(mem2);

    const sessionAMemories = await repo.findBySession('session-a', MemoryLayer.L1);
    expect(sessionAMemories).toHaveLength(1);
    expect(sessionAMemories[0].id).toBe('mem1');

    const sessionBMemories = await repo.findBySession('session-b', MemoryLayer.L1);
    expect(sessionBMemories).toHaveLength(1);
    expect(sessionBMemories[0].id).toBe('mem2');
  });

  it('should find all memories in a layer', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    const mem2 = createMemory('mem2', 'session-b', MemoryLayer.L1);
    const mem3 = createMemory('mem3', 'session-a', MemoryLayer.L2);

    await repo.save(mem1);
    await repo.save(mem2);
    await repo.save(mem3);

    const l1Memories = await repo.findAllByLayer(MemoryLayer.L1);
    expect(l1Memories).toHaveLength(2);
    expect(l1Memories.map(m => m.id)).toContain('mem1');
    expect(l1Memories.map(m => m.id)).toContain('mem2');

    const l2Memories = await repo.findAllByLayer(MemoryLayer.L2);
    expect(l2Memories).toHaveLength(1);
    expect(l2Memories[0].id).toBe('mem3');
  });

  it('should load memory by ID across all layers', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    const mem2 = createMemory('mem2', 'session-a', MemoryLayer.L2);

    await repo.save(mem1);
    await repo.save(mem2);

    const loadedMem1 = await repo.load('mem1');
    expect(loadedMem1).not.toBeNull();
    expect(loadedMem1?.id).toBe('mem1');
    expect(loadedMem1?.layer).toBe(MemoryLayer.L1);

    const loadedMem2 = await repo.load('mem2');
    expect(loadedMem2).not.toBeNull();
    expect(loadedMem2?.id).toBe('mem2');
    expect(loadedMem2?.layer).toBe(MemoryLayer.L2);
  });

  it('should return L1 index for a session', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    const mem2 = createMemory('mem2', 'session-a', MemoryLayer.L1);
    const mem3 = createMemory('mem3', 'session-b', MemoryLayer.L1);

    await repo.save(mem1);
    await repo.save(mem2);
    await repo.save(mem3);

    const indexA = await repo.getL1Index('session-a');
    expect(indexA).toHaveLength(2);
    expect(indexA).toContain('mem1');
    expect(indexA).toContain('mem2');

    const indexB = await repo.getL1Index('session-b');
    expect(indexB).toEqual(['mem3']);
  });

  it('should correctly report existence of memory', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    await repo.save(mem1);

    expect(await repo.exists('mem1')).toBe(true);
    expect(await repo.exists('non-existent')).toBe(false);
  });

  it('should return empty list when layer file does not exist', async () => {
    const memories = await repo.findAllByLayer(MemoryLayer.L3);
    expect(memories).toEqual([]);
  });

  it('should return null when loading non-existent ID', async () => {
    const memory = await repo.load('non-existent');
    expect(memory).toBeNull();
  });

  it('should list all IDs across all layers', async () => {
    const mem1 = createMemory('mem1', 'session-a', MemoryLayer.L1);
    const mem2 = createMemory('mem2', 'session-b', MemoryLayer.L2);
    const mem3 = createMemory('mem3', 'session-c', MemoryLayer.L3);

    await repo.save(mem1);
    await repo.save(mem2);
    await repo.save(mem3);

    const allIds = await repo.list();
    expect(allIds).toHaveLength(3);
    expect(allIds).toContain('mem1');
    expect(allIds).toContain('mem2');
    expect(allIds).toContain('mem3');
  });
});
