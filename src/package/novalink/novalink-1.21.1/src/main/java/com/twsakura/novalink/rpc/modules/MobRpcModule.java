package com.twsakura.novalink.rpc.modules;

import com.google.gson.JsonObject;
import com.twsakura.novalink.rpc.RpcModule;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 針對通用生物 (Mob) 實作的 RPC 模組。
 * 暴露所有安全、物理合法的生物操作與感知介面給 TS 系統。
 */
public class MobRpcModule extends RpcModule {
    private final Mob mob;

    public MobRpcModule(Mob mob) {
        this.mob = mob;
        
        // 1. 導航與移動 (Movement)
        register("mob.moveTo", this::moveTo);
        register("mob.stopMove", this::stopMove);
        register("mob.lookAt", this::lookAt);
        register("mob.lookAtEntity", this::lookAtEntity);
        register("mob.jump", this::jump);
        
        // 2. 互動與戰鬥 (Interaction & Combat)
        register("mob.attack", this::attack);
        register("mob.swingArm", this::swingArm);
        register("mob.say", this::say);
        
        // 3. 狀態與感知 (Perception)
        register("mob.getStatus", this::getStatus);
        register("mob.getEquipment", this::getEquipment);
        register("mob.getNearbyEntities", this::getNearbyEntities);
        register("mob.rayTraceBlocks", this::rayTraceBlocks);
        register("mob.getPathStatus", this::getPathStatus); // 新增尋路狀態感知
    }

    // ---------- 導航與移動 ----------
    private Object moveTo(JsonObject params) {
        double x = params.get("x").getAsDouble();
        double y = params.get("y").getAsDouble();
        double z = params.get("z").getAsDouble();
        double speed = params.has("speed") ? params.get("speed").getAsDouble() : 1.0;
        
        // 呼叫底層 A* 尋路，如果無法到達目標會直接回傳 false
        return mob.getNavigation().moveTo(x, y, z, speed);
    }

    // ... (保持原樣的移動邏輯) ...
    private Object stopMove(JsonObject params) {
        mob.getNavigation().stop();
        return true;
    }

    private Object lookAt(JsonObject params) {
        double x = params.get("x").getAsDouble();
        double y = params.get("y").getAsDouble();
        double z = params.get("z").getAsDouble();
        mob.getLookControl().setLookAt(x, y, z);
        return true;
    }

    private Object lookAtEntity(JsonObject params) {
        if (!params.has("target_uuid")) return false;
        UUID targetUuid = UUID.fromString(params.get("target_uuid").getAsString());
        Entity target = getEntityByUuid(targetUuid);
        if (target != null) {
            mob.getLookControl().setLookAt(target);
            return true;
        }
        return false;
    }

    private Object jump(JsonObject params) {
        mob.getJumpControl().jump();
        return true;
    }

    // ---------- 互動與戰鬥 ----------
    private Object attack(JsonObject params) {
        if (!params.has("target_uuid")) return false;
        UUID targetUuid = UUID.fromString(params.get("target_uuid").getAsString());
        Entity target = getEntityByUuid(targetUuid);
        if (target != null) {
            return mob.doHurtTarget(target);
        }
        return false;
    }

    private Object swingArm(JsonObject params) {
        String handStr = params.has("hand") ? params.get("hand").getAsString() : "main";
        InteractionHand hand = handStr.equalsIgnoreCase("off") ? InteractionHand.OFF_HAND : InteractionHand.MAIN_HAND;
        mob.swing(hand);
        return true;
    }

    private Object say(JsonObject params) {
        if (!params.has("message")) return false;
        String message = params.get("message").getAsString();
        String name = mob.getName().getString();
        
        // 模擬說話：廣播給周圍 30 格內的玩家
        Component chatComponent = Component.literal("<" + name + "> " + message);
        AABB area = mob.getBoundingBox().inflate(30.0);
        for (Player player : mob.level().getEntitiesOfClass(Player.class, area)) {
            player.sendSystemMessage(chatComponent);
        }
        return true;
    }

    // ---------- 狀態與感知 ----------
    private Object getPathStatus(JsonObject params) {
        net.minecraft.world.entity.ai.navigation.PathNavigation nav = mob.getNavigation();
        Map<String, Object> status = new HashMap<>();
        
        status.put("is_moving", !nav.isDone()); // 是否正在移動中
        
        net.minecraft.world.level.pathfinder.Path path = nav.getPath();
        if (path != null) {
            status.put("can_reach_target", path.canReach()); // 是否能完全抵達目標 (或只是停在附近)
            status.put("target_pos", List.of(path.getTarget().getX(), path.getTarget().getY(), path.getTarget().getZ()));
            status.put("path_length", path.getNodeCount());  // 總路徑節點數
            status.put("current_node", path.getNextNodeIndex()); // 目前走到第幾個節點
        } else {
            status.put("target_pos", null);
        }
        return status;
    }

    private Object getStatus(JsonObject params) {
        Map<String, Object> status = new HashMap<>();
        status.put("hp", mob.getHealth());
        status.put("max_hp", mob.getMaxHealth());
        status.put("pos", List.of(mob.getX(), mob.getY(), mob.getZ()));
        status.put("yaw", mob.getYRot());
        status.put("pitch", mob.getXRot());
        status.put("on_ground", mob.onGround());
        status.put("in_water", mob.isInWater());
        status.put("is_on_fire", mob.isOnFire());
        status.put("armor_value", mob.getArmorValue());
        return status;
    }

    private Object getEquipment(JsonObject params) {
        Map<String, String> equipment = new HashMap<>();
        for (EquipmentSlot slot : EquipmentSlot.values()) {
            String itemName = BuiltInRegistries.ITEM.getKey(mob.getItemBySlot(slot).getItem()).toString();
            equipment.put(slot.getName(), itemName);
        }
        return equipment;
    }

    private Object getNearbyEntities(JsonObject params) {
        double radius = params.has("radius") ? params.get("radius").getAsDouble() : 10.0;
        AABB searchBox = mob.getBoundingBox().inflate(radius);
        List<Entity> entities = mob.level().getEntities(mob, searchBox);
        
        List<Map<String, Object>> list = new ArrayList<>();
        for (Entity e : entities) {
            list.add(Map.of(
                "uuid", e.getUUID().toString(),
                "type", BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString(),
                "distance", mob.distanceTo(e)
            ));
        }
        return list;
    }

    private Object rayTraceBlocks(JsonObject params) {
        double distance = params.has("distance") ? params.get("distance").getAsDouble() : 5.0;
        HitResult hit = mob.pick(distance, 1.0f, false);
        
        if (hit.getType() == HitResult.Type.BLOCK) {
            BlockHitResult blockHit = (BlockHitResult) hit;
            String blockName = BuiltInRegistries.BLOCK.getKey(mob.level().getBlockState(blockHit.getBlockPos()).getBlock()).toString();
            return Map.of(
                "type", "block",
                "block", blockName,
                "pos", List.of(blockHit.getBlockPos().getX(), blockHit.getBlockPos().getY(), blockHit.getBlockPos().getZ())
            );
        }
        return Map.of("type", "miss");
    }

    // ---------- 內部輔助函數 ----------
    private Entity getEntityByUuid(UUID uuid) {
        // 在當前維度的周圍尋找目標實體（這可確保合法性，防止超遠距離鎖定）
        for (Entity e : mob.level().getEntities(mob, mob.getBoundingBox().inflate(64.0))) {
            if (e.getUUID().equals(uuid)) return e;
        }
        return null;
    }
}
