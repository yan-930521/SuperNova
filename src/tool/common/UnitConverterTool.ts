import { z } from 'zod';
import { IAgentExecuteContext } from '../../task/types';
import { BaseTool } from '../BaseTool';

/**
 * UnitConverterTool
 * 執行單位轉換 (長度、重量、溫度等)。
 */
export class UnitConverterTool extends BaseTool {
  constructor() {
    super(
      'unit_converter',
      'Convert between different units (length, weight, temperature).',
      'TIER_1',
      ['utility'],
      z.object({
        value: z.number().describe('The value to convert.'),
        from: z.string().describe('Source unit (e.g., "km", "kg", "celsius").'),
        to: z.string().describe('Target unit (e.g., "mile", "lb", "fahrenheit").')
      })
    );
  }

  async run(input: { value: number; from: string; to: string }, _context: IAgentExecuteContext): Promise<any> {
    const { value, from, to } = input;
    const f = from.toLowerCase();
    const t = to.toLowerCase();

    // 溫度轉換
    if (f === 'celsius' && t === 'fahrenheit') return { result: (value * 9/5) + 32 };
    if (f === 'fahrenheit' && t === 'celsius') return { result: (value - 32) * 5/9 };

    // 長度轉換 (基準：公尺)
    const lengthMap: Record<string, number> = {
      'm': 1, 'km': 1000, 'cm': 0.01, 'mm': 0.001,
      'inch': 0.0254, 'foot': 0.3048, 'yard': 0.9144, 'mile': 1609.34
    };

    if (lengthMap[f] && lengthMap[t]) {
      const meters = value * lengthMap[f];
      return { result: meters / lengthMap[t] };
    }

    // 重量轉換 (基準：公斤)
    const weightMap: Record<string, number> = {
      'kg': 1, 'g': 0.001, 'mg': 0.000001,
      'lb': 0.453592, 'oz': 0.0283495
    };

    if (weightMap[f] && weightMap[t]) {
      const kgs = value * weightMap[f];
      return { result: kgs / weightMap[t] };
    }

    throw new Error(`Unsupported unit conversion: ${from} to ${to}`);
  }
}
