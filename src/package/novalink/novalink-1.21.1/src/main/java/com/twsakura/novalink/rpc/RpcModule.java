package com.twsakura.novalink.rpc;

import com.google.gson.JsonObject;
import java.util.HashMap;
import java.util.Map;

/**
 * RPC 模組基底類別。
 * 所有的實體控制器都繼承此類，並手動暴露自己的 function 給 TS 進程呼叫。
 */
public abstract class RpcModule {
    
    // 定義方法簽章：接收 JsonObject 參數，回傳 Object (最後會被轉成 JSON)
    public interface RpcMethod {
        Object invoke(JsonObject params) throws Exception;
    }

    private final Map<String, RpcMethod> methods = new HashMap<>();

    /**
     * 子類別透過此方法將 Java 函數暴露為 RPC 介面
     */
    protected void register(String methodName, RpcMethod handler) {
        methods.put(methodName, handler);
    }

    public Object execute(String methodName, JsonObject params) throws Exception {
        RpcMethod handler = methods.get(methodName);
        if (handler == null) {
            throw new NoSuchMethodException("RPC Method not found: " + methodName);
        }
        return handler.invoke(params);
    }
    
    public boolean hasMethod(String methodName) {
        return methods.containsKey(methodName);
    }
}
