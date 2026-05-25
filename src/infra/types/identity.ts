export interface IUser {
  id: string;
  name: string;
  preferences: Record<string, any>;
  apiKeys: Record<string, string>;
}

export interface IUserRepository {
  findById(id: string): Promise<IUser | null>;
  save(user: IUser): Promise<void>;
}
