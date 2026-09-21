package com.twsakura.novalink.rpc.modules;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.twsakura.novalink.rpc.RpcModule;
import com.github.tartaricacid.touhoulittlemaid.entity.passive.EntityMaid;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.ItemStack;

import java.util.HashMap;
import java.util.Map;

/**
 * 專為 Touhou Little Maid (車萬女僕) 實作的極致特化 RPC 模組。
 * 盡可能暴露所有安全的內部狀態與操作，賦予 AI 完整的女僕代入感。
 */
public class MaidRpcModule extends MobRpcModule {
    private final EntityMaid maid;

    public MaidRpcModule(EntityMaid maid) {
        super(maid);
        this.maid = maid;

        // ==========================================
        // [感知] 狀態與屬性 (Perception - Stats & Status)
        // ==========================================
        register("maid.getMaidData", this::getMaidData);         // 獲取好感度、馴服狀態、主人
        register("maid.getHomeStatus", this::getHomeStatus);     // 獲取待命模式狀態與座標
        register("maid.getTaskStatus", this::getTaskStatus);     // 獲取當前工作任務與排程
        register("maid.getBackpackStatus", this::getBackpackStatus); // 獲取背包等級與完整內容物清單
        
        // ==========================================
        // [控制] 模式與環境 (Control - Modes)
        // ==========================================
        register("maid.setHomeMode", this::setHomeMode);         // 開關待命模式
        register("maid.setHomePos", this::setHomePos);           // 重新設定待命中心座標
        
        // ==========================================
        // [控制] 姿態與動畫 (Control - Poses)
        // ==========================================
        register("maid.setSitting", this::setSitting);           // 控制坐下/站起
        register("maid.setBegging", this::setBegging);           // 控制祈求(賣萌)動作
        register("maid.sendChatBubble", this::sendChatBubble);   // 觸發視覺對話框
        
        // ==========================================
        // [進階控制] 工作與物品 (Tasks & Inventory)
        // ==========================================
        // register("maid.setTask", this::setTask);              // (視 TLM Task API 開放)
        // register("maid.dropItem", this::dropItem);            // (供未來擴充：丟棄背包特定物品)
    }

    // --------------------------------------------------------
    // [感知] 模組實作
    // --------------------------------------------------------

    private Object getMaidData(JsonObject params) {
        Map<String, Object> data = new HashMap<>();
        data.put("favorability", maid.getFavorability());
        data.put("is_tamed", maid.isTame());
        if (maid.getOwnerUUID() != null) {
            data.put("owner_uuid", maid.getOwnerUUID().toString());
        }
        return data;
    }

    private Object getHomeStatus(JsonObject params) {
        Map<String, Object> data = new HashMap<>();
        data.put("is_home_mode", maid.isHomeModeEnable());
        if (maid.getHomePos() != null) {
            data.put("home_pos", new int[]{
                maid.getHomePos().getX(), 
                maid.getHomePos().getY(), 
                maid.getHomePos().getZ()
            });
        }
        return data;
    }

    private Object getTaskStatus(JsonObject params) {
        Map<String, Object> data = new HashMap<>();
        if (maid.getTask() != null) {
            data.put("current_task", maid.getTask().getUid().toString());
        } else {
            data.put("current_task", "none");
        }
        return data;
    }

    private Object getBackpackStatus(JsonObject params) {
        Map<String, Object> data = new HashMap<>();
        data.put("has_backpack", maid.hasBackpack());
        data.put("backpack_level", maid.getBackpackLevel());
        
        // 深度讀取女僕專屬背包內的所有物品
        JsonArray inventory = new JsonArray();
        var inv = maid.getMaidInv();
        if (inv != null) {
            for (int i = 0; i < inv.getSlots(); i++) {
                ItemStack stack = inv.getStackInSlot(i);
                if (!stack.isEmpty()) {
                    JsonObject item = new JsonObject();
                    item.addProperty("slot", i);
                    item.addProperty("item", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
                    item.addProperty("count", stack.getCount());
                    inventory.add(item);
                }
            }
        }
        data.put("inventory", inventory);
        return data;
    }

    // --------------------------------------------------------
    // [控制] 模組實作
    // --------------------------------------------------------

    private Object setHomeMode(JsonObject params) {
        if (!params.has("enable")) return false;
        maid.setHomeModeEnable(params.get("enable").getAsBoolean());
        return true;
    }

    private Object setHomePos(JsonObject params) {
        if (params.has("x") && params.has("y") && params.has("z")) {
            int x = params.get("x").getAsInt();
            int y = params.get("y").getAsInt();
            int z = params.get("z").getAsInt();
            maid.setHomePos(new BlockPos(x, y, z));
            return true;
        }
        return false;
    }

    private Object setSitting(JsonObject params) {
        if (!params.has("sitting")) return false;
        maid.setInSittingPose(params.get("sitting").getAsBoolean());
        return true;
    }

    private Object setBegging(JsonObject params) {
        if (!params.has("begging")) return false;
        maid.setBegging(params.get("begging").getAsBoolean());
        return true;
    }

    private Object sendChatBubble(JsonObject params) {
        if (!params.has("message")) return false;
        String message = params.get("message").getAsString();
        
        try {
            // 呼叫視覺對話泡泡 (如果方法名在 TLM 1.21.1 改變，需在此處微調)
            maid.sendChatBubble(Component.literal(message));
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
        return true;
    }
}
