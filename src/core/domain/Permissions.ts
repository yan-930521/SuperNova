/**
 * Agent 權限標記 (字串陣列形式)
 * 透過字串陣列來精細控制 Agent 的操作權限與系統行為
 */
export const AgentPermissions = {
    // 基礎檔案與環境操作
    READ_WORKSPACE: 'READ_WORKSPACE',
    WRITE_WORKSPACE: 'WRITE_WORKSPACE',
    EXECUTE_COMMANDS: 'EXECUTE_COMMANDS',
    
    // 範圍限制 (危險操作)
    MODIFY_CORE_SYSTEM: 'MODIFY_CORE_SYSTEM',
    
    // 系統與記憶功能
    MANAGE_GRAPH_MEMORY: 'MANAGE_GRAPH_MEMORY',
    TRIGGER_DAILY_SUM: 'TRIGGER_DAILY_SUM',
    
    // 代理人與任務管理
    SPAWN_TEMP_AGENT: 'SPAWN_TEMP_AGENT',
    SPAWN_PERSISTENT: 'SPAWN_PERSISTENT',
    ASSIGN_TASKS: 'ASSIGN_TASKS',
    
    // 特殊權限
    CONTROL_EMBODIMENT: 'CONTROL_EMBODIMENT',
    GRANT_PERMISSIONS: 'GRANT_PERMISSIONS',
    
    // 系統最高權限 (包含所有權限)
    ADMINISTRATOR: 'ADMINISTRATOR'
} as const;

export type PermissionString = typeof AgentPermissions[keyof typeof AgentPermissions];

export class PermissionUtils {
    /**
     * 檢查代理人是否具備指定權限
     * @param agentPermissions 代理人目前擁有的權限陣列
     * @param requiredPermission 欲檢查的權限
     */
    public static hasPermission(agentPermissions: string[], requiredPermission: string): boolean {
        if (agentPermissions.includes(AgentPermissions.ADMINISTRATOR)) {
            return true;
        }
        return agentPermissions.includes(requiredPermission);
    }

    /**
     * 檢查代理人是否同時具備多個指定權限
     * @param agentPermissions 代理人目前擁有的權限陣列
     * @param requiredPermissions 欲檢查的權限陣列
     */
    public static hasAllPermissions(agentPermissions: string[], requiredPermissions: string[]): boolean {
        if (agentPermissions.includes(AgentPermissions.ADMINISTRATOR)) {
            return true;
        }
        return requiredPermissions.every(p => agentPermissions.includes(p));
    }

    /**
     * 新增權限 (避免重複)
     */
    public static addPermission(agentPermissions: string[], newPermission: string): string[] {
        if (!agentPermissions.includes(newPermission)) {
            return [...agentPermissions, newPermission];
        }
        return agentPermissions;
    }

    /**
     * 移除權限
     */
    public static removePermission(agentPermissions: string[], permissionToRemove: string): string[] {
        return agentPermissions.filter(p => p !== permissionToRemove);
    }
}
