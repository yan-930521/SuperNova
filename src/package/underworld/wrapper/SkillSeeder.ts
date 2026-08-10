import * as fs from 'fs/promises';
import * as path from 'path';
import { ICodeSkillRepository } from '@core/domain/ICodeSkillRepository';

export async function seedSkills(codeSkillRepo: ICodeSkillRepository, sessionId: string, agentId: string): Promise<void> {
  const skillsDir = path.join(__dirname, '../skills');
  let files: string[];

  try {
    files = await fs.readdir(skillsDir);
  } catch (error) {
    console.warn(`[SkillSeeder] Failed to read skills directory: ${skillsDir}`, error);
    return;
  }

  for (const file of files) {
    if (file.endsWith('.ts')) {
      const skillId = file.replace(/\.ts$/, '');
      
      try {
        const existingSkill = await codeSkillRepo.getSkill(sessionId, agentId, skillId);
        if (!existingSkill) {
          const filePath = path.join(skillsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          await codeSkillRepo.saveSkill(sessionId, agentId, skillId, 'Seeded CodeSkill', content);
          console.log(`[SkillSeeder] Seeded skill: ${skillId}`);
        }
      } catch (error) {
        // If getSkill throws an exception when the skill doesn't exist, we can handle it here and save
        try {
          const filePath = path.join(skillsDir, file);
          const content = await fs.readFile(filePath, 'utf-8');
          await codeSkillRepo.saveSkill(sessionId, agentId, skillId, 'Seeded CodeSkill', content);
          console.log(`[SkillSeeder] Seeded skill (after catch): ${skillId}`);
        } catch (saveError) {
          console.error(`[SkillSeeder] Error saving skill ${skillId}:`, saveError);
        }
      }
    }
  }
}
