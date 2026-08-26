package com.twsakura.novalink;

import org.slf4j.Logger;
import com.mojang.logging.LogUtils;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.config.ModConfig;
import net.neoforged.fml.ModContainer;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.server.ServerStartingEvent;

@Mod(NovaLink.MODID)
public class NovaLink {
    
    public static final String MODID = "novalink";
    public static final Logger LOGGER = LogUtils.getLogger();
    
    private com.twsakura.novalink.rpc.RpcServer rpcServer;

    public NovaLink(IEventBus modEventBus, ModContainer modContainer) {
        // 將自己註冊到 NeoForge 的主事件匯流排，以便接收 ServerStarting 等事件
        NeoForge.EVENT_BUS.register(this);

        // 註冊 Mod 的設定檔 (Config)
        modContainer.registerConfig(ModConfig.Type.COMMON, Config.SPEC);
    }

    @SubscribeEvent
    public void onServerStarting(ServerStartingEvent event) {
        LOGGER.info("Starting NovaLink RPC Server...");
        
        // 取得當前世界存檔路徑，初始化 RPC 註冊表的持久化儲存
        java.io.File worldDir = event.getServer().getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT).toFile();
        com.twsakura.novalink.rpc.RpcRegistry.init(worldDir);
        
        try {
            // 從 Config 取得 Port (如果 Config 沒有設定，預設可改為 8080)
            int port = 8080;
            try {
                // 防呆：避免原本的範例 Config 沒有 SERVER_PORT 導致編譯失敗
                port = Config.SERVER_PORT.get();
            } catch (Exception ignored) {}
            
            rpcServer = new com.twsakura.novalink.rpc.RpcServer(port);
            rpcServer.start();
            LOGGER.info("NovaLink RPC Server initialized on port " + port);
        } catch (Exception e) {
            LOGGER.error("Failed to start NovaLink RPC Server", e);
        }
    }

    @SubscribeEvent
    public void onServerStopping(net.neoforged.neoforge.event.server.ServerStoppingEvent event) {
        LOGGER.info("Server stopping, shutting down NovaLink APIs...");
        if (rpcServer != null) {
            try {
                rpcServer.stop();
            } catch (InterruptedException e) {
                LOGGER.error("Failed to stop RPC Server gracefully", e);
            }
        }
    }

    @SubscribeEvent
    public void onRegisterCommands(net.neoforged.neoforge.event.RegisterCommandsEvent event) {
        com.twsakura.novalink.command.NovaLinkCommand.register(event.getDispatcher());
    }
}
