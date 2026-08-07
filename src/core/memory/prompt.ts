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

export const SESSION_SUMMARY_PROMPT = `You are a highly capable analytical AI. Your task is to generate a comprehensive Daily/Session Summary from the given conversation log.
This summary will serve as the AI's episodic memory to understand the macro-level events, decisions, and context of this session.

Conversation Log:
\`\`\`
{conversation}
\`\`\`

Please generate a Markdown formatted summary that includes:
1. **Session Goal / Main Topics**: What was the primary focus of this session?
2. **Key Decisions & Outcomes**: What were the important decisions made, bugs fixed, or features implemented?
3. **User Preferences & Context**: Did the user express any new preferences, rules, or architectural directions?
4. **Unresolved Issues / Next Steps**: What is left to do?

⚠️ STRICT RULES:
- DO NOT summarize the AI's own identity, persona, roleplay settings, or emotional states. The AI already knows who it is from its core profile.
- Focus ONLY on the User, the User's context, the tasks discussed, and the real-world events or concepts mentioned.

Keep the summary concise, professional, and well-structured using Markdown.`;
