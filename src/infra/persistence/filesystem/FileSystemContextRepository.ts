import { IBlackboardState } from '../../types/blackboard';
import { IContextRepository } from '../IRepository';
import { BaseFileSystemRepository } from './BaseFileSystemRepository';

/**
 * FileSystemContextRepository
 * 負責 OrchestratedContext (Blackboard) 的檔案系統持久化。
 */
export class FileSystemContextRepository 
  extends BaseFileSystemRepository<IBlackboardState> 
  implements IContextRepository<IBlackboardState> 
{
  constructor(baseDir: string) {
    super(baseDir, 'ContextRepo');
  }
}
