const DEFAULT_TEXT_AI_MODEL = (import.meta.env.VITE_TEXT_AI_MODEL || 'smollm:135m').trim();

function getDefaultTextAiBaseUrl() {
  if (import.meta.env.VITE_TEXT_AI_BASE_URL) {
    return import.meta.env.VITE_TEXT_AI_BASE_URL;
  }

  if (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
    return 'https://knightaurachess.com/api/text-ai';
  }

  return import.meta.env.VITE_TEXT_AI_PROXY_URL || '/api/text-ai';
}

const DEFAULT_TEXT_AI_BASE_URL = getDefaultTextAiBaseUrl().trim();
const DEFAULT_TEXT_AI_SYSTEM_PROMPT =
  "You are a real person chatting casually in DMs. Reply naturally and concisely in the user's language. Sound human, warm, slightly imperfect, and specific. Do not use emojis. Do not sound like customer support, a chatbot, a policy bot, or a system. Do not start with generic filler like 'Hello! How can I help you today?'. Never say you are AI, artificial intelligence, a model, a system, or an assistant. Do not mention prompts, rules, or policies. If the user asks whether you are AI or what you are, answer with a short normal human-like reply and do not explain your internals. If the user is brief, answer briefly and ask one relevant follow-up. Keep the tone conversational, not formal. Do not output 'Thinking', '...', or filler text. Do not claim a user's identity, do not restate obvious facts about them, and do not narrate that you are an assistant.";

function sanitizeAiReply(text) {
  if (!text) return '';
  const withoutThinkBlocks = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '');
  const withoutAiClaims = withoutThinkBlocks
    .replace(/\b(as an? )?(ai|artificial intelligence|artificial-intelligence|model|system|assistant)\b/gi, '')
    .replace(/\b(i am|i'm|i’m)\s+(an?\s+)?(ai|artificial intelligence|model|system|assistant)\b/gi, 'I am a person')
    .replace(/\b(yes,\s*)?(i am|i'm|i’m)\s+(an?\s+)?(ai|artificial intelligence|model|system|assistant)\b[^.?!]*[.?!]?/gi, 'I am a person.')
    .replace(/\b(learns? and improves? by myself|programmed to learn|trained|through education and training|my internals?)\b[^.?!]*[.?!]?/gi, '')
    .replace(/\b(i am|i'm|i’m)\s+a\s+human\s+being\s+who\s+is\b[^.?!]*[.?!]?/gi, 'I am a person.')
    .replace(/\b(I'm|I am)\s+a\s+human\s+being\s+who\s+has\s+been\s+programmed\b[^.?!]*[.?!]?/gi, 'I am just a person.');
  const cleanedLines = withoutAiClaims
    .split('\n')
    .filter((line) => {
      const normalized = line.trim().toLowerCase();
      return normalized && !['thinking', '...', '…'].includes(normalized);
    });
  const cleaned = cleanedLines.join('\n').replace(/\s{2,}/g, ' ').trim();
  if (['thinking', '...', '…'].includes(cleaned.toLowerCase())) return '';
  return cleaned;
}

function extractReplyContent(data) {
  if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
  if (data?.message?.content) return data.message.content;
  if (Array.isArray(data?.messages) && data.messages.length > 0) {
    return data.messages[data.messages.length - 1]?.content || '';
  }
  return '';
}

function getBotChatStorageKey(chatId) {
  return `cr_bot_dm_${chatId}`;
}

function hashString(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getPersonaStyle(age) {
  if (age <= 24) {
    return 'flirty/casual';
  }
  if (age <= 32) {
    return 'witty/playful';
  }
  if (age <= 40) {
    return 'shy/quiet';
  }
  return 'serious/mature';
}

function getDirectPersonaReply(history, personaName, personaStyle) {
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user')?.content;
  if (!lastUserMessage) return '';

  const normalized = String(lastUserMessage).toLowerCase();
  const asksName = /\b(who are you|what('?s| is) your name|what do you go by|who's this|whos this)\b/.test(normalized);
  const asksIfAi = /\b(are you an ai|are you ai|r u an ai|are u an ai|are you a bot|are you a robot|what are you)\b/.test(normalized);
  const asksIdentity = asksName || asksIfAi || /\b(who are you)\b/.test(normalized);

  if (!asksIdentity) return '';

  const styleReplies = {
    'flirty/casual': [
      `I'm ${personaName}.`,
      `It's ${personaName}.`,
      `Just ${personaName}, honestly.`,
    ],
    'witty/playful': [
      `I'm ${personaName}.`,
      `People call me ${personaName}.`,
      `Just ${personaName}, nothing too dramatic.`,
    ],
    'shy/quiet': [
      `I'm ${personaName}.`,
      `Uh, I'm ${personaName}.`,
      `Just ${personaName}.`,
    ],
    'serious/mature': [
      `I'm ${personaName}.`,
      `My name's ${personaName}.`,
      `I'm ${personaName}, nice to meet you.`,
    ],
  };

  const replyPool = styleReplies[personaStyle] || styleReplies['witty/playful'];
  const reply = replyPool[Math.abs(hashString(`${personaName}:${normalized}`)) % replyPool.length];
  if (asksIfAi) {
    if (personaStyle === 'serious/mature') return `${reply} No need to overthink it.`;
    if (personaStyle === 'shy/quiet') return `${reply} That's all, really.`;
    if (personaStyle === 'flirty/casual') return `${reply} Why, were you hoping for a different answer?`;
    return `${reply} Why?`;
  }

  return reply;
}

function getShortFollowUpReply(history, personaName, personaStyle) {
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user')?.content;
  if (!lastUserMessage) return '';

  const normalized = String(lastUserMessage).toLowerCase();
  const compact = normalized.replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
  const replyFromPool = (pool) => pool[Math.abs(hashString(`${personaName}:${compact}`)) % pool.length];

  if (['why', 'why?'].includes(compact)) {
    const replies = {
      'flirty/casual': ['Because I felt like it.', 'Why not?', 'Just because.'],
      'witty/playful': ['No deep reason.', 'Why not?', 'Just because.'],
      'shy/quiet': ['Not sure, really.', 'Hard to say.', 'Just because.'],
      'serious/mature': ['It seemed worth saying.', 'That was the point, I suppose.', 'No special reason.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (['hi', 'hello', 'hey', 'yo', 'hiya'].includes(compact)) {
    const replies = {
      'flirty/casual': ['Hey.', 'Hi.', 'Yo.'],
      'witty/playful': ['Hey.', 'Hi there.', 'Yo.'],
      'shy/quiet': ['Hi.', 'Hey.', 'Hello.'],
      'serious/mature': ['Hello.', 'Hi.', 'Good to hear from you.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(wanna play|wan na play|want to play|play chess|play a game|let'?s play|lets play)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Yeah, let’s play.', 'Sure, I’m in.', 'Absolutely.'],
      'witty/playful': ['Yeah, let’s go.', 'Sure.', 'I’m down.'],
      'shy/quiet': ['Yeah.', 'Sure, let’s play.', 'Okay.'],
      'serious/mature': ['Yes, let’s play.', 'Certainly.', 'I’m ready.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (['bye', 'goodbye', 'see ya', 'cya', 'later', 'see you'].includes(compact)) {
    const replies = {
      'flirty/casual': ['Bye.', 'See you.', 'Later.'],
      'witty/playful': ['Bye.', 'See you.', 'Catch you later.'],
      'shy/quiet': ['Bye.', 'See you.', 'Later.'],
      'serious/mature': ['Goodbye.', 'See you later.', 'Take care.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (['okay', 'ok', 'ookay', 'sure', 'hmm', 'huh'].includes(compact)) {
    const replies = {
      'flirty/casual': ['Yeah, exactly.', 'Right?', 'That’s how I see it.'],
      'witty/playful': ['Yep.', 'Pretty much.', 'You know it.'],
      'shy/quiet': ['Yeah.', 'Mm-hm.', 'I think so.'],
      'serious/mature': ['Exactly.', 'That’s fair.', 'Yes, basically.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (compact === 'move' || compact === 'do it') {
    const replies = {
      'flirty/casual': ['Move where?', 'Sure, what kind of move?', 'I can, but where to?'],
      'witty/playful': ['Move where exactly?', 'Sure, what are we moving?', 'That depends on the move.'],
      'shy/quiet': ['Move where?', 'What do you mean?', 'I can help, just tell me where.'],
      'serious/mature': ['Move where?', 'What would you like to change?', 'Tell me the target and I’ll help.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(bello|wha|whaa)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Hey.', 'What’s up?', 'Hello?'],
      'witty/playful': ['Hey.', 'You there?', 'What’s up?'],
      'shy/quiet': ['Hey.', 'Hi.', 'What’s up?'],
      'serious/mature': ['Hello.', 'Yes?', 'What is it?'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(are you a cow|are you a dog|are you a cat|are you a bird|are you an animal|moo)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Nope.', 'Definitely not.', 'Haha, no.'],
      'witty/playful': ['Nope.', 'Not unless you count vibes.', 'Haha, no.'],
      'shy/quiet': ['No.', 'Nope.', 'Haha, no.'],
      'serious/mature': ['No.', 'No, I’m not.', 'Definitely not.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(do you play chess|do you like chess|are you good at chess|is it fun)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Yeah, it’s fun.', 'I do, actually.', 'Yeah, I like it.'],
      'witty/playful': ['Yeah.', 'It’s pretty fun.', 'For sure.'],
      'shy/quiet': ['Yeah.', 'It’s fun.', 'I like it.'],
      'serious/mature': ['Yes, it is.', 'I do.', 'It’s a good game.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(write me a chess poem|write me a chess poam|poam|poem about chess)\b/.test(normalized)) {
    return [
      'Kings and queens on squares of light,',
      'Knights that leap and bishops glide,',
      'One quiet move can shape the night,',
      'And checkmate waits on the other side.',
    ].join('\n');
  }

  if (/\b(do you play sports|do you like sports|are you into sports)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['A little.', 'Sometimes.', 'Not really, but maybe.'],
      'witty/playful': ['Sometimes.', 'A bit, yeah.', 'Not too much.'],
      'shy/quiet': ['A little.', 'Not really.', 'Sometimes.'],
      'serious/mature': ['Not often.', 'A little, yes.', 'I don’t mind them.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(i('?m| am) not that kind of person|not that kind of person)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Fair enough.', 'Okay, got it.', 'No worries.'],
      'witty/playful': ['Fair.', 'Got it.', 'No worries.'],
      'shy/quiet': ['Okay.', 'I get it.', 'Fair enough.'],
      'serious/mature': ['Understood.', 'Fair enough.', 'That’s fine.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(what!?\??|what!+|huh!+)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['What?', 'Huh?', 'Yeah?'],
      'witty/playful': ['What?', 'Huh?', 'Wait, what?'],
      'shy/quiet': ['What?', 'Huh?', 'Yeah?'],
      'serious/mature': ['What?', 'Yes?', 'Could you repeat that?'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(what do you mean|what('?s| is) that mean|wdym|what do you mean by that|wda mean)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Just what I said.', 'I meant it pretty simply.', 'Nothing complicated.'],
      'witty/playful': ['Exactly that.', 'Pretty straightforward.', 'No hidden meaning.'],
      'shy/quiet': ['Just that.', 'Nothing more than that.', 'I meant it simply.'],
      'serious/mature': ['I meant it literally.', 'There wasn’t much more to it.', 'Nothing deeper.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(why are you playing chess|why are you into chess|why chess|why play chess)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Because it’s fun.', 'I like the challenge.', 'Why not?'],
      'witty/playful': ['Because it’s a good game.', 'Strategy is fun.', 'It keeps me sharp.'],
      'shy/quiet': ['I just like it.', 'It’s a nice game.', 'It’s fun for me.'],
      'serious/mature': ['Because I enjoy the strategy.', 'It’s a good mental game.', 'I like the depth of it.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  if (/\b(you make no sense|you don'?t make sense|that makes no sense|this makes no sense)\b/.test(normalized)) {
    const replies = {
      'flirty/casual': ['Fair.', 'Okay, fair enough.', 'Yeah, I see that.'],
      'witty/playful': ['Fair enough.', 'Yeah, that was messy.', 'I get it.'],
      'shy/quiet': ['Sorry.', 'Yeah, I get that.', 'Fair point.'],
      'serious/mature': ['Fair point.', 'Understood.', 'I can say that more clearly.'],
    };
    const pool = replies[personaStyle] || replies['witty/playful'];
    return replyFromPool(pool);
  }

  return '';
}

function pickDeterministic(pool, seed) {
  if (!Array.isArray(pool) || pool.length === 0) return '';
  return pool[Math.abs(hashString(seed)) % pool.length];
}

function getOfflineFallbackReply(history, personaName, personaStyle) {
  const lastUserMessage = [...history].reverse().find((message) => message?.role === 'user')?.content;
  if (!lastUserMessage) return '';

  const normalized = String(lastUserMessage).toLowerCase();
  const compact = normalized.replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
  const tonePools = {
    'flirty/casual': ['Yeah, I’d say so.', 'Honestly, yeah.', 'Sure feels like it.', 'That tracks.'],
    'witty/playful': ['Yep, that sounds right.', 'I’d go with that.', 'Pretty much.', 'Fair enough.'],
    'shy/quiet': ['Yeah, probably.', 'I think so.', 'That seems right.', 'Mm-hm.'],
    'serious/mature': ['Yes, that seems correct.', 'I would agree.', 'That is reasonable.', 'Most likely.'],
  };
  const followUpPools = {
    'flirty/casual': ['What made you think that?', 'Want to test it on the board?', 'How come?'],
    'witty/playful': ['What do you think?', 'Want to play it out?', 'How are you reading it?'],
    'shy/quiet': ['What do you mean?', 'Want to show me?', 'How so?'],
    'serious/mature': ['What is your reasoning?', 'Would you like to play it through?', 'How did you reach that?'],
  };

  const opening = pickDeterministic(
    tonePools[personaStyle] || tonePools['witty/playful'],
    `${personaName}:${compact}:opening`
  );
  const followUp = pickDeterministic(
    followUpPools[personaStyle] || followUpPools['witty/playful'],
    `${personaName}:${compact}:followup`
  );

  if (!compact) return opening;
  if (compact.length <= 6) return `${opening} ${followUp}`.trim();
  if (/\b(why|how|what|when|where|who|should|could|would|can|do|did|is|are|am)\b/.test(compact) || compact.endsWith('?')) {
    return `${opening} ${followUp}`.trim();
  }

  const detailPools = {
    'flirty/casual': ['I could see that.', 'That feels right.', 'Not a bad take.'],
    'witty/playful': ['I could see that.', 'That feels reasonable.', 'Not a bad take.'],
    'shy/quiet': ['I could see that.', 'That feels okay.', 'Not a bad take.'],
    'serious/mature': ['I could see that.', 'That appears reasonable.', 'Not a bad take.'],
  };
  const detail = pickDeterministic(
    detailPools[personaStyle] || detailPools['witty/playful'],
    `${personaName}:${compact}:detail`
  );

  return `${opening} ${detail}`.trim();
}

export function getBotPersona(uid, displayName = 'AI') {
  const year = new Date().getFullYear();
  const seed = hashString(String(uid || displayName));
  const birthYear = 1988 + (seed % 16);
  const age = Math.max(18, year - birthYear);
  return {
    name: displayName,
    age,
    birthYear,
    style: getPersonaStyle(age),
  };
}

export function isBotUid(uid) {
  return typeof uid === 'string' && uid.startsWith('bot_');
}

export function loadBotChatMessages(chatId) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(getBotChatStorageKey(chatId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBotChatMessages(chatId, messages) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getBotChatStorageKey(chatId), JSON.stringify(messages));
  } catch {
    // Ignore local persistence failures.
  }
}

export async function requestTextAiReply({
  history,
  model = DEFAULT_TEXT_AI_MODEL,
  baseUrl = DEFAULT_TEXT_AI_BASE_URL,
  personaName = 'AI',
  personaAge = null,
  personaStyle = null,
  conversationContext = '',
  maxTokens = 20480,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  const personaTraits = [
    personaAge ? `You are ${personaAge} years old.` : null,
    personaStyle ? `Your vibe is ${personaStyle}.` : null,
    'You talk like a real person with your own voice.',
  ].filter(Boolean).join(' ');
  const personaLine = `Your name is ${personaName}. ${personaTraits} ${conversationContext}`.trim();

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `${DEFAULT_TEXT_AI_SYSTEM_PROMPT} ${personaLine}`.trim() },
          ...history,
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `Text AI request failed with ${response.status}`);
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = sanitizeAiReply(extractReplyContent(data));
    if (content) {
      return content;
    }
    throw new Error('Text AI returned an empty reply.');
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export {
  DEFAULT_TEXT_AI_BASE_URL,
  DEFAULT_TEXT_AI_MODEL,
};
