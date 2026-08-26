package com.twsakura.novalink.rpc;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.twsakura.novalink.NovaLink;
import net.minecraft.server.MinecraftServer;
import net.neoforged.neoforge.server.ServerLifecycleHooks;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.util.UUID;
import java.util.concurrent.Callable;

/**
 * 負責處理 JSON-RPC 2.0 通訊的 WebSocket Server
 */
public class RpcServer extends WebSocketServer {
    private static final Gson GSON = new Gson();
    
    // 儲存實例以供主動發送 Event
    private static RpcServer instance;
    private WebSocket activeConnection;

    public RpcServer(int port) {
        super(new InetSocketAddress(port));
        instance = this;
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        NovaLink.LOGGER.info("SuperNova TS connected to NovaLink RPC Server: " + conn.getRemoteSocketAddress());
        this.activeConnection = conn;
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        NovaLink.LOGGER.info("SuperNova TS disconnected.");
        if (this.activeConnection == conn) {
            this.activeConnection = null;
        }
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        try {
            JsonObject request = GSON.fromJson(message, JsonObject.class);
            if (!request.has("jsonrpc") || !request.has("method") || !request.has("id")) {
                sendError(conn, null, -32600, "Invalid Request");
                return;
            }

            String method = request.get("method").getAsString();
            long id = request.get("id").getAsLong();
            JsonObject params = request.has("params") ? request.getAsJsonObject("params") : new JsonObject();
            
            if (!params.has("uuid")) {
                sendError(conn, id, -32602, "Missing 'uuid' in params");
                return;
            }
            
            UUID uuid = UUID.fromString(params.get("uuid").getAsString());
            RpcModule module = RpcRegistry.getModule(uuid);
            
            if (module == null) {
                sendError(conn, id, -32001, "Entity not bound to RPC");
                return;
            }
            
            if (!module.hasMethod(method)) {
                sendError(conn, id, -32601, "Method not found in entity's RpcModule");
                return;
            }

            // 所有對 Minecraft 的操作都必須拋回 Main Thread
            Object result = runOnMainThread(() -> module.execute(method, params));
            sendResult(conn, id, result);

        } catch (Exception e) {
            NovaLink.LOGGER.error("RPC Error", e);
            sendError(conn, null, -32000, "Server error: " + e.getMessage());
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        NovaLink.LOGGER.error("WebSocket Error", ex);
    }

    @Override
    public void onStart() {
        NovaLink.LOGGER.info("NovaLink RPC Server started on port " + getPort());
    }
    
    /**
     * 開放給外部主動推播事件給 TS 端 (例如實體受傷事件)
     */
    public static void broadcastEvent(String eventName, Object params) {
        if (instance != null && instance.activeConnection != null && instance.activeConnection.isOpen()) {
            JsonObject rpc = new JsonObject();
            rpc.addProperty("jsonrpc", "2.0");
            rpc.addProperty("method", "event." + eventName);
            rpc.add("params", GSON.toJsonTree(params));
            instance.activeConnection.send(GSON.toJson(rpc));
        }
    }

    private void sendResult(WebSocket conn, Long id, Object result) {
        JsonObject response = new JsonObject();
        response.addProperty("jsonrpc", "2.0");
        if (id != null) response.addProperty("id", id);
        response.add("result", GSON.toJsonTree(result));
        conn.send(GSON.toJson(response));
    }

    private void sendError(WebSocket conn, Long id, int code, String message) {
        JsonObject response = new JsonObject();
        response.addProperty("jsonrpc", "2.0");
        if (id != null) response.addProperty("id", id);
        
        JsonObject error = new JsonObject();
        error.addProperty("code", code);
        error.addProperty("message", message);
        response.add("error", error);
        
        conn.send(GSON.toJson(response));
    }
    
    private <T> T runOnMainThread(Callable<T> task) throws Exception {
        MinecraftServer server = ServerLifecycleHooks.getCurrentServer();
        if (server == null) throw new IllegalStateException("Minecraft Server is not running.");
        if (server.isSameThread()) {
            return task.call();
        } else {
            return server.submit(() -> {
                try {
                    return task.call();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }).get();
        }
    }
}
