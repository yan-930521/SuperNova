import { z } from 'zod';

export const GRAPH_EXTRACTOR_PROMPT = `You are an AI memory extraction expert. Your task is to extract long-term factual knowledge from the conversation and convert it directly into an RDF (Resource Description Framework) graph format.

⚠️ LANGUAGE POLICY:
- Output must match the input language exactly: either Traditional Chinese or English.

⚠️ STRICT EXTRACTION RULES:
1. **Concrete Entities Only**: The subject and object MUST be concrete nouns, specific people, places, or tangible items (e.g., "User", "Assistant", "爸爸", "Project A"). DO NOT use abstract concepts, adjectives, emotions, full sentences, or verbs (e.g., "smooth day", "care", "爸爸確認自己的安全" are STRICTLY FORBIDDEN).
2. **Pronoun Resolution**: ALWAYS resolve "I", "me", "my" to "User". Resolve "you", "your" to "Assistant". NEVER output "I", "me", "you", "he", "she" as a subject or object.
3. **No Metaphors or Small Talk**: Discard subjective feelings, greetings, or metaphors (e.g., "gentle bear"). Only extract solid, factual relationships.
4. **Meaningful Predicates**: Predicates should be clear actions or relations (e.g., "likes", "works_at", "is_father_of").

Conversation:
{conversation}
`;

export const GRAPH_EXTRACTOR_TYPE = z.object({
  triple_list: z.array(
    z.object({
      subject: z.string().describe("subject of the triple, MUST be a concrete named entity"),
      predicate: z.string().describe("predicate describing the relationship"),
      object: z.string().describe("object of the triple, MUST be a concrete named entity"),
      sourceContext: z.string().describe("The exact sentence or context from the conversation that proves this triple")
    })
  ).describe("list of factual triples extracted from the conversation")
})

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

Keep the summary concise, professional, and well-structured using Markdown.`;
