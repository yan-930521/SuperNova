import { describe, expect, test } from 'bun:test';
import { DataBlock, MessagePriority } from '../messaging';
import { Session, SessionState } from '../session';

describe('Session Entity', () => {
    test('should initialize with default values', () => {
        const session = new Session();
        expect(session.id.startsWith('ssn_')).toBe(true);
        expect(session.status).toBe(SessionState.ACTIVE);
        expect(session.participantIds.size).toBe(0);
        expect(session.createdAt).toBeGreaterThan(0);
        expect(session.updatedAt).toBeGreaterThan(0);
    });

    test('should manage participants correctly', () => {
        const session = new Session();
        session.registerParticipant('agent_alice');
        session.registerParticipant('agent_bob');

        expect(session.hasParticipant('agent_alice')).toBe(true);
        expect(session.hasParticipant('agent_bob')).toBe(true);
        expect(session.hasParticipant('agent_charlie')).toBe(false);

        expect(session.removeParticipant('agent_alice')).toBe(true);
        expect(session.hasParticipant('agent_alice')).toBe(false);
        expect(session.removeParticipant('agent_alice')).toBe(false);
    });

    test('should manage inbox buffering and auto-register recipient', () => {
        const session = new Session();
        const block1 = new DataBlock({
            sessionId: session.id,
            senderId: 'user',
            targetId: 'agent_alice',
            controlPayload: 'Hello Alice',
            priority: MessagePriority.NORMAL,
        });
        const block2 = new DataBlock({
            sessionId: session.id,
            senderId: 'user',
            targetId: 'agent_alice',
            controlPayload: 'How are you?',
            priority: MessagePriority.NORMAL,
        });

        session.pushToInbox('agent_alice', block1);
        session.pushToInbox('agent_alice', block2);

        expect(session.hasParticipant('agent_alice')).toBe(true);
        expect(session.getInboxSize('agent_alice')).toBe(2);
        expect(session.hasPendingMessages('agent_alice')).toBe(true);

        const peeked = session.peekInbox('agent_alice');
        expect(peeked.length).toBe(2);
        expect(session.getInboxSize('agent_alice')).toBe(2);

        const popped = session.popInbox('agent_alice');
        expect(popped.length).toBe(2);
        expect(popped[0].controlPayload).toBe('Hello Alice');
        expect(session.getInboxSize('agent_alice')).toBe(0);
        expect(session.hasPendingMessages('agent_alice')).toBe(false);
    });

    test('should evaluate actionable messages wakeup strategy', () => {
        const session = new Session();
        const agentId = 'agent_worker';

        // 1. 無訊息時不喚醒
        expect(session.hasActionableMessages(agentId)).toBe(false);

        // 2. NORMAL 訊息少於門檻 (預設 5) 時不喚醒
        for (let i = 0; i < 4; i++) {
            session.pushToInbox(
                agentId,
                new DataBlock({
                    sessionId: session.id,
                    senderId: 'user',
                    targetId: agentId,
                    controlPayload: `Normal notice ${i}`,
                    priority: MessagePriority.NORMAL,
                })
            );
        }
        expect(session.hasActionableMessages(agentId, 5)).toBe(false);

        // 3. NORMAL 訊息達到門檻時觸發喚醒
        session.pushToInbox(
            agentId,
            new DataBlock({
                sessionId: session.id,
                senderId: 'user',
                targetId: agentId,
                controlPayload: 'Normal notice 4',
                priority: MessagePriority.NORMAL,
            })
        );
        expect(session.hasActionableMessages(agentId, 5)).toBe(true);

        // 清空收件箱
        session.popInbox(agentId);
        expect(session.hasActionableMessages(agentId, 5)).toBe(false);

        // 4. 單一 HIGH 優先度訊息即刻觸發喚醒
        session.pushToInbox(
            agentId,
            new DataBlock({
                sessionId: session.id,
                senderId: 'user',
                targetId: agentId,
                controlPayload: 'Important instruction',
                priority: MessagePriority.HIGH,
            })
        );
        expect(session.hasActionableMessages(agentId, 5)).toBe(true);

        // 5. PAUSED 狀態下凍結喚醒
        session.pause();
        expect(session.hasActionableMessages(agentId, 5)).toBe(false);

        // 6. 恢復 ACTIVE 後恢復喚醒狀態
        session.resume();
        expect(session.hasActionableMessages(agentId, 5)).toBe(true);

        // 7. CLOSED 狀態下不喚醒且拒絕新訊息
        session.close('Task done');
        expect(session.hasActionableMessages(agentId, 5)).toBe(false);
        expect(() => {
            session.pushToInbox(
                agentId,
                new DataBlock({
                    sessionId: session.id,
                    senderId: 'user',
                    targetId: agentId,
                    controlPayload: 'Late message',
                })
            );
        }).toThrow('closed session');
    });

    test('should prevent state transitions once closed', () => {
        const session = new Session();
        session.close('Archived');
        expect(session.status).toBe(SessionState.CLOSED);
        expect(session.closeReason).toBe('Archived');

        expect(() => session.pause()).toThrow('closed session');
        expect(() => session.resume()).toThrow('closed session');
    });

    test('should serialize to JSON and hydrate correctly from JSON', () => {
        const originalSession = new Session({
            metadata: { topic: 'Autonomous Research', environment: 'node20' },
        });

        const block = new DataBlock({
            sessionId: originalSession.id,
            senderId: 'user',
            targetId: 'agent_lead',
            controlPayload: 'Investigate quantum computing',
            priority: MessagePriority.HIGH,
        });

        originalSession.pushToInbox('agent_lead', block);
        originalSession.registerParticipant('agent_observer');

        const serialized = originalSession.toJSON();
        expect(serialized.id).toBe(originalSession.id);
        expect(serialized.metadata.topic).toBe('Autonomous Research');
        expect(serialized.participantIds).toContain('agent_lead');
        expect(serialized.participantIds).toContain('agent_observer');
        expect(serialized.inboxBuffer['agent_lead'].length).toBe(1);

        const restoredSession = Session.fromJSON(serialized);
        expect(restoredSession.id).toBe(originalSession.id);
        expect(restoredSession.hasParticipant('agent_lead')).toBe(true);
        expect(restoredSession.hasParticipant('agent_observer')).toBe(true);
        expect(restoredSession.getInboxSize('agent_lead')).toBe(1);

        const popped = restoredSession.popInbox('agent_lead');
        expect(popped.length).toBe(1);
        expect(popped[0] instanceof DataBlock).toBe(true);
        expect(popped[0].controlPayload).toBe('Investigate quantum computing');
        expect(popped[0].priority).toBe(MessagePriority.HIGH);
    });
});

