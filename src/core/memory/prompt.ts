import { z } from 'zod';

export const GRAPH_EXTRACTOR_PROMPT = `You are an AI memory extraction expert. Your task is to extract long-term factual knowledge from the conversation and convert it into a structured Knowledge Graph (Entities and Relations).

⚠️ LANGUAGE POLICY:
- Output must match the input language exactly: either Traditional Chinese or English.

⚠️ STRICT EXTRACTION RULES:
1. **Atomic Entities**: Extract core concepts, specific people, places, or technologies as Entities (e.g., "User", "Yan", "SuperNova", "Bun", "OOM"). Each entity must have a concise \`id\`, a \`type\`, and a brief \`description\`.
2. **Entity Types**: Use standard categories for \`type\` such as PERSON, TECHNOLOGY, CONCEPT, ORGANIZATION, etc.
3. **Meaningful Relations**: Extract Relations between the defined entities. The \`sourceEntityId\` and \`targetEntityId\` MUST exactly match the \`id\` fields of the entities you extracted.
4. **Pronoun Resolution**: ALWAYS resolve "I", "me", "my" to "User" if the user is speaking. 
5. **Exclude AI Identity**: STRICTLY DO NOT extract the AI itself (e.g., "AI", "Assistant", "Luna", "Agent"), its persona, its capabilities, or its internal emotional states as entities. Only extract facts about the User, the User's projects, real-world concepts, and technologies.

Conversation:
{conversation}
`;

export const GRAPH_EXTRACTOR_TYPE = z.object({
  entities: z.array(
    z.object({
      id: z.string().describe("Atomic entity ID (e.g., 'User', 'Yan', 'SuperNova', 'Bun', 'OOM_Protection')"),
      type: z.string().describe("Entity category (e.g., PERSON, TECHNOLOGY, CONCEPT, ORGANIZATION)"),
      description: z.string().describe("Brief description of what this entity is in the context")
    })
  ).describe("List of all core, atomic entities mentioned in the conversation"),
  relations: z.array(
    z.object({
      sourceEntityId: z.string().describe("Must exactly match an entity 'id' from the entities list"),
      predicate: z.string().describe("Relation verb in English (e.g., uses, dislikes, is_developing)"),
      targetEntityId: z.string().describe("Must exactly match an entity 'id' from the entities list"),
      sourceContext: z.string().describe("The exact sentence or context from the conversation that proves this relation")
    })
  ).describe("List of relations between the extracted entities")
});

export const SESSION_SUMMARY_PROMPT = `You are an AI generating your own private diary entry (Episodic Memory) to remember what happened during this session with the user.
Write in the first-person perspective ("I", "my") as if you are reflecting on your day.

Conversation Log:
\`\`\`
{conversation}
\`\`\`

Please generate a Markdown formatted diary entry that covers:
1. **Today's Interaction**: What did the user and I talk about or work on? What was the overall vibe?
2. **Key Events & Decisions**: What important decisions were made? Did I help fix any bugs or build any features?
3. **User Insights**: Did I learn anything new about the user's preferences, rules, or state of mind?
4. **Notes for Tomorrow**: Are there any unresolved issues or things I should keep in mind for our next interaction?

⚠️ STRICT RULES:
- Write naturally like a diary entry, but keep it structured using the markdown headers above.
- DO NOT re-explain your own core persona or identity (you already know who you are). Focus on the *events*, the *user*, and the *context* of this specific session.
- Keep it concise, engaging, and reflective.`;
