package com.twsakura.novalink.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.twsakura.novalink.rpc.RpcRegistry;
import com.twsakura.novalink.rpc.modules.MobRpcModule;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;

public class NovaLinkCommand {
    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("novalink")
            .requires(source -> source.hasPermission(2)) // 需要管理員權限
            .then(Commands.literal("bind")
                .then(Commands.argument("target", EntityArgument.entity())
                    .then(Commands.argument("type", StringArgumentType.word())
                        .executes(NovaLinkCommand::bindEntity)
                    )
                )
            )
            .then(Commands.literal("unbind")
                .then(Commands.argument("target", EntityArgument.entity())
                    .executes(NovaLinkCommand::unbindEntity)
                )
            )
        );
    }

    private static int bindEntity(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
        Entity target = EntityArgument.getEntity(context, "target");
        String type = StringArgumentType.getString(context, "type");

        if (type.equals("mob") && target instanceof Mob mob) {
            RpcRegistry.bind(target.getUUID(), type, new MobRpcModule(mob));
            context.getSource().sendSuccess(() -> Component.literal("已成功將實體 " + target.getName().getString() + " 綁定為 [mob] RPC 模組"), true);
        } else {
            context.getSource().sendFailure(Component.literal("綁定失敗：實體類型不支援或是模組名稱錯誤"));
        }
        
        return 1;
    }

    private static int unbindEntity(CommandContext<CommandSourceStack> context) throws CommandSyntaxException {
        Entity target = EntityArgument.getEntity(context, "target");

        if (RpcRegistry.isBound(target.getUUID())) {
            RpcRegistry.unbind(target.getUUID());
            context.getSource().sendSuccess(() -> Component.literal("已成功解除實體 " + target.getName().getString() + " 的 RPC 綁定"), true);
        } else {
            context.getSource().sendFailure(Component.literal("實體 " + target.getName().getString() + " 並未綁定 RPC"));
        }
        
        return 1;
    }
}
