import * as fs from 'fs/promises';
import * as path from 'path';
import { UserDTO, IUserRepository } from '../types/identity';

/**
 * 基於檔案系統的用戶存儲實現。
 * 將用戶數據以 JSON 格式存儲在指定目錄下的檔案中。
 */
export class FileSystemUserRepository implements IUserRepository {
  /**
   * @param baseDir 存儲用戶檔案的基礎目錄路徑。
   */
  constructor(private baseDir: string) {}

  /**
   * 根據 ID 查找用戶。
   * @param id 用戶 ID
   * @returns 返回用戶對象，若不存在則返回 null。
   */
  async findById(id: string): Promise<UserDTO | null> {
    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // 檔案不存在或讀取失敗時返回 null
      return null;
    }
  }

  /**
   * 保存或更新用戶信息。
   * @param user 用戶對象
   */
  async save(user: UserDTO): Promise<void> {
    const filePath = path.join(this.baseDir, `${user.id}.json`);
    
    // 確保基礎目錄存在
    await fs.mkdir(this.baseDir, { recursive: true });
    
    // 將用戶對象序列化為 JSON 並寫入檔案
    await fs.writeFile(filePath, JSON.stringify(user, null, 2), 'utf-8');
  }
}
