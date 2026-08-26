package com.twsakura.novalink.rpc;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.twsakura.novalink.NovaLink;
import com.twsakura.novalink.rpc.modules.MobRpcModule;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.lang.reflect.Type;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CompletableFuture;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.neoforged.neoforge.server.ServerLifecycleHooks;

/**
 * 管理當前被接管的實體與其對應的 RPC Module，並提供 JSON 持久化。
 */
public class RpcRegistry {
    private static final Gson GSON = new Gson();
    private static File saveFile;
    
    // 保存實體 UUID 與其綁定的 RPC 模組類型 (用於持久化)
    private static final Map<UUID, String> persistentBindings = new ConcurrentHashMap<>();
    
    // 快取的活躍實例 (不存檔)
    private static final Map<UUID, RpcModule> activeModules = new ConcurrentHashMap<>();

    public static void init(File worldDir) {
        saveFile = new File(worldDir, "novalink_rpc_bindings.json");
        load();
    }

    public static void bind(UUID uuid, String type, RpcModule module) {
        persistentBindings.put(uuid, type);
        activeModules.put(uuid, module);
        saveAsync();
    }

    public static void unbind(UUID uuid) {
        persistentBindings.remove(uuid);
        activeModules.remove(uuid);
        saveAsync();
    }

    public static boolean isBound(UUID uuid) {
        return persistentBindings.containsKey(uuid);
    }

    public static RpcModule getModule(UUID uuid) {
        if (activeModules.containsKey(uuid)) {
            return activeModules.get(uuid);
        }

        // 懶加載：如果存在持久化紀錄，但尚未實例化，則嘗試在世界中尋找實體並重建 Module
        String type = persistentBindings.get(uuid);
        if (type != null) {
            Entity entity = findEntity(uuid);
            if (entity != null) {
                RpcModule module = createModule(type, entity);
                if (module != null) {
                    activeModules.put(uuid, module);
                    return module;
                }
            }
        }
        return null;
    }

    private static RpcModule createModule(String type, Entity entity) {
        if (type.equals("mob") && entity instanceof Mob mob) {
            return new MobRpcModule(mob);
        }
        return null;
    }

    private static Entity findEntity(UUID uuid) {
        MinecraftServer server = ServerLifecycleHooks.getCurrentServer();
        if (server == null) return null;
        for (ServerLevel level : server.getAllLevels()) {
            Entity e = level.getEntity(uuid);
            if (e != null) return e;
        }
        return null;
    }

    private static void load() {
        if (saveFile == null || !saveFile.exists()) return;
        try (FileReader reader = new FileReader(saveFile)) {
            Type type = new TypeToken<Map<UUID, String>>(){}.getType();
            Map<UUID, String> data = GSON.fromJson(reader, type);
            if (data != null) {
                persistentBindings.putAll(data);
            }
            NovaLink.LOGGER.info("Loaded {} RPC bindings from {}", persistentBindings.size(), saveFile.getName());
        } catch (Exception e) {
            NovaLink.LOGGER.error("Failed to load RPC bindings", e);
        }
    }

    private static void saveAsync() {
        if (saveFile == null) return;
        // Copy data for thread-safe async save
        Map<UUID, String> dataSnapshot = new HashMap<>(persistentBindings);
        CompletableFuture.runAsync(() -> {
            try (FileWriter writer = new FileWriter(saveFile)) {
                GSON.toJson(dataSnapshot, writer);
            } catch (Exception e) {
                NovaLink.LOGGER.error("Failed to save RPC bindings", e);
            }
        });
    }
}
