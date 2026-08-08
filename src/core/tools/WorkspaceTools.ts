import { z } from 'zod';

import { IWorkspaceManager } from '../domain/IWorkspaceManager';
import { BaseTool, ToolContext } from './BaseTool';

export class ReadFileTool extends BaseTool {
  public readonly name = 'read_file';
  public readonly description = 'Read the contents of a file within the workspace. Provide the relative path to the file.';
  public readonly schema = z.object({
    relativePath: z.string().describe('The relative path of the file to read, e.g., src/main.ts'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager
  ) {
    super();
  }

  public async execute(args: { relativePath: string }, context: ToolContext): Promise<string> {
    try {
      const content = await this.workspaceManager.readFile(context.sessionId, context.agentId, args.relativePath);
      return content;
    } catch (error: any) {
      return `Failed to read file: ${error.message}`;
    }
  }
}

export class ReadBlobTool extends BaseTool {
  public readonly name = 'read_blob';
  public readonly description = 'Read the full content of a compressed data blob. WARNING: DO NOT call this tool unless you explicitly see a `<Pointer: blob_xxx>` string in your recent message logs! If you just want to read a normal file in the workspace, you MUST use `read_file` instead.';
  public readonly schema = z.object({
    blobId: z.string().describe('The ID of the blob to read, e.g., blob_1a2b3c'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager
  ) {
    super();
  }

  public async execute(args: { blobId: string }, context: ToolContext): Promise<string> {
    try {
      const content = await this.workspaceManager.readBlob(context.sessionId, args.blobId);
      return content;
    } catch (error: any) {
      return `Failed to read blob ${args.blobId}: ${error.message}`;
    }
  }
}

export class WriteFileTool extends BaseTool {
  public readonly name = 'write_file';
  public readonly description = 'Write content to a file within the workspace. Provide the relative path and the content to write.';
  public readonly schema = z.object({
    relativePath: z.string().describe('The relative path of the file to write, e.g., src/main.ts'),
    content: z.string().describe('The content to write to the file'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager
  ) {
    super();
  }

  public async execute(args: { relativePath: string; content: string }, context: ToolContext): Promise<string> {
    try {
      await this.workspaceManager.writeFile(context.sessionId, context.agentId, args.relativePath, args.content);
      return `Successfully wrote to ${args.relativePath}`;
    } catch (error: any) {
      return `Failed to write file: ${error.message}`;
    }
  }
}

export class ListFilesTool extends BaseTool {
  public readonly name = 'list_files';
  public readonly description = 'List files in a directory within the workspace. Provide the relative path, or leave empty for root.';
  public readonly schema = z.object({
    relativePath: z.string().optional().describe('The relative path of the directory to list. Leave empty for root directory.'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager
  ) {
    super();
  }

  public async execute(args: { relativePath?: string }, context: ToolContext): Promise<string> {
    try {
      const files = await this.workspaceManager.listFiles(context.sessionId, context.agentId, args.relativePath);
      return files.join('\n');
    } catch (error: any) {
      return `Failed to list files: ${error.message}`;
    }
  }
}

export class RunBashTool extends BaseTool {
  public readonly name = 'run_bash';
  public readonly description = 'Run a bash command within the workspace sandbox.';
  public readonly schema = z.object({
    command: z.string().describe('The bash command to execute'),
  });

  constructor(
    private readonly workspaceManager: IWorkspaceManager
  ) {
    super();
  }

  public async execute(args: { command: string }, context: ToolContext): Promise<string> {
    try {
      const result = await this.workspaceManager.runBash(context.sessionId, context.agentId, args.command);
      return `ExitCode: ${result.exitCode}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
    } catch (error: any) {
      return `Failed to run bash command: ${error.message}`;
    }
  }
}
