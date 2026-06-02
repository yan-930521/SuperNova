import { describe, expect, it } from "bun:test";
import { SystemEvents, AgentEvents } from "../IBus";

describe("EventTypes", () => {
    it("應包含五大角色的標準事件類型 (AgentEvents)", () => {
        expect(AgentEvents.Supervisor).toBeDefined();
        expect(AgentEvents.Planning).toBeDefined();
        expect(AgentEvents.Doing).toBeDefined();
        expect(AgentEvents.Checking).toBeDefined();
        expect(AgentEvents.Acting).toBeDefined();
    });

    it("應包含系統級事件 (SystemEvents)", () => {
        expect(SystemEvents.Runtime.Tick).toBeDefined();
        expect(SystemEvents.Session.Started).toBeDefined();
    });

    it("每個角色應包含 Start, Finish 或 Fail 等核心動作", () => {
        expect(AgentEvents.Planning.Start).toBe("PLANNING_START");
        expect(AgentEvents.Doing.Finish).toBe("DOING_FINISH");
        expect(AgentEvents.Checking.Pass).toBe("CHECKING_PASS");
    });
});
