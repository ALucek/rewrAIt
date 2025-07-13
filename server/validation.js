const { z } = require("zod");

// Schema for OpenAI chat completions
const openaiChatSchema = z.object({
  model: z.string().min(1),
  stream: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .min(1),
});

// Schema for Anthropic messages
const anthropicSchema = z.object({
  model: z.string().min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().optional(),
  system: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .min(1),
});

const partSchema = z.object({
  text: z.string().min(1),
});

const messageSchema = z.object({
  role: z.enum(["user", "model", "assistant"]).optional(),
  parts: z.array(partSchema).min(1),
});

const geminiSchema = z.object({
  system_instruction: z
    .object({
      parts: z.array(partSchema).min(1),
    })
    .optional(),
  contents: z.array(messageSchema).min(1),
});

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }
    req.body = result.data;
    next();
  };
}

module.exports = {
  schemas: {
    openaiChatSchema,
    anthropicSchema,
    geminiSchema,
  },
  validateBody,
}; 