import { z } from 'zod';

import { TavilyExtract, TavilySearch } from '@langchain/tavily';

import { BaseTool, ToolContext } from './BaseTool';

export class SearchWebTool extends BaseTool {
    private readonly _tool = new TavilySearch({
        maxResults: 5,
        // TavilySearch expects TAVILY_API_KEY in the environment
        tavilyApiKey: process.env.TAVILY_API_KEY
    });

    public readonly name = this._tool.name;
    public readonly description = this._tool.description;
    public readonly schema = this._tool.schema;


    public async execute(args: any, context: ToolContext): Promise<string> {
        try {
            const results = await this._tool.invoke(args);
            return typeof results === 'string' ? results : JSON.stringify(results);
        } catch (error: any) {
            return `Failed to search the web: ${error.message}`;
        }
    }
}

export class ReadUrlContentTool extends BaseTool {
    private readonly _tool = new TavilyExtract({
        tavilyApiKey: process.env.TAVILY_API_KEY,
        format: "markdown",
        includeImages: false,
        includeFavicon: false,
        includeUsage: false,
    });

    public readonly name = this._tool.name;
    public readonly description = this._tool.description;
    public readonly schema = this._tool.schema;

    public async execute(args: any, context: ToolContext): Promise<string> {
        try {
            const results = await this._tool.invoke(args);
            
            const output = typeof results === 'string' ? results : JSON.stringify(results);
            return output; 
        } catch (error: any) {
            return `Failed to extract URL content: ${error.message}`;
        }
    }
}
