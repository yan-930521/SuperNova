import { UserDTO } from '../../types/identity';
import { IUserRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';

/**
 * 基於檔案系統的用戶儲存庫實作
 * 繼承自 BaseFileSystemRepository，提供基礎的 JSON 儲存功能。
 */
export class FileSystemUserRepository 
  extends BaseFileSystemRepository<UserDTO> 
  implements IUserRepository<UserDTO> 
{
  constructor(baseDir: string) {
    super(baseDir, 'UserRepo');
  }
}
