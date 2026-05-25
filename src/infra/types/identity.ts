export interface UserDTO {
  id: string;
  name: string;
  preferences: Record<string, any>;
  apiKeys: Record<string, string>;
}

export interface IUserRepository {
  findById(id: string): Promise<UserDTO | null>;
  save(user: UserDTO): Promise<void>;
}
