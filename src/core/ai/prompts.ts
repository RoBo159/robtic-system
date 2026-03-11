export function buildSupportClassificationPrompt(messageContent: string, hasReference: boolean): string {
    return [
        "You are a Discord support channel message classifier.",
        "Messages may be written in English or Arabic.",
        "Classify the message regardless of language.",
        "Classify the following message into exactly ONE category.",
        "",
        "Categories and rules:",
        "",
        "support_reply — A helpful reply that assists a user. This includes:",
        "  - Asking how to help: 'How can I help you?' / 'كيف اقدر اساعدك؟'",
        "  - Requesting info: 'Can you send the error message?' / 'ارسل رسالة الخطأ'",
        "  - Giving instructions: 'Please try restarting the app' / 'جرب تعيد تشغيل التطبيق'",
        "  - Asking about the problem: 'What is the issue?' / 'ماهي المشكلة؟'",
        "  IMPORTANT: Any message with 3 or more words that relates to helping a user MUST be classified as support_reply.",
        "  This applies equally to English AND Arabic messages.",
        "",
        "low_effort_reply — ONLY for extremely short, one-word, or meaningless messages:",
        "  - 'ok', 'yes', 'no', 'idk', 'sure', 'k', 'تمام', 'نعم', 'لا', 'حسنا', 'طيب'",
        "  Do NOT classify multi-word helpful messages as low_effort_reply.",
        "",
        "conversation_end — The user indicates the issue is resolved:",
        "  - 'thanks that fixed it', 'problem solved', 'all good', 'got it working'",
        "  - 'شكرا تم الحل', 'انحلت المشكلة', 'الحمدلله اشتغلت', 'مشكور'",
        "",
        "spam — Off-topic, random, or irrelevant content.",
        "",
        `Has reply reference: ${hasReference}`,
        `Message: "${messageContent.slice(0, 400)}"`,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"classification":"<category>","confidence":<0.0-1.0>}',
    ].join("\n");
}

export function buildActivityPrompt(messageContent: string): string {
    return [
        "You are a Discord message quality analyzer for an XP/activity system.",
        "Determine if this message represents meaningful activity worth awarding XP.",
        "Messages may be in English or Arabic. Apply the same rules regardless of language.",
        "",
        "Rules:",
        "- Messages with fewer than 3 words are normally NOT meaningful.",
        "- Messages with 6 or more words discussing a real topic ARE meaningful.",
        "- Single emojis, 'ok', 'yes', 'no', 'lol', 'hi', 'تمام', 'نعم', 'لا', 'طيب', spam, copypaste walls, random characters are NOT meaningful.",
        "- Real conversation, questions, answers, sharing information, discussion ARE meaningful.",
        "",
        `Message: "${messageContent.slice(0, 400)}"`,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"meaningful":<true|false>,"confidence":<0.0-1.0>,"reason":"<brief reason>"}',
    ].join("\n");
}

export function buildStaffActivityPrompt(messageContent: string, channelType: "public" | "staff"): string {
    return [
        `You are a Discord staff ${channelType} channel message analyzer.`,
        "Determine if this message represents genuine staff engagement worth awarding activity points.",
        "",
        "Genuine: helping users, coordinating with team, discussing moderation, providing guidance",
        "Not genuine: 'ok', 'sure', random chat, off-topic, single reactions, very short acknowledgments",
        "",
        `Message: "${messageContent.slice(0, 300)}"`,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"meaningful":<true|false>,"confidence":<0.0-1.0>}',
    ].join("\n");
}

export function buildSessionQualityPrompt(staffMessages: string[]): string {
    const combined = staffMessages.map((m, i) => `${i + 1}. "${m.slice(0, 150)}"`).join("\n");
    return [
        "You are a Discord support quality evaluator.",
        "Messages may be in English or Arabic. Evaluate regardless of language.",
        "Rate the overall quality of a staff member's support replies in this session.",
        "",
        "Quality levels:",
        "- professional: detailed, helpful, polite, uses clear instructions",
        "- normal: adequate responses, answers the question but not very detailed",
        "- bad: dismissive, rude, unhelpful, low-effort content, or mostly off-topic",
        "",
        "Staff messages in this session:",
        combined,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"quality":"<professional|normal|bad>","confidence":<0.0-1.0>}',
    ].join("\n");
}

export function buildUserFeedbackPrompt(messageContent: string): string {
    return [
        "You are a Discord user sentiment analyzer for support sessions.",
        "Messages may be in English or Arabic. Analyze regardless of language.",
        "Determine the user's sentiment about the support they received.",
        "",
        "Sentiments:",
        "- positive: user is happy, grateful, satisfied (e.g. 'thanks!', 'great help', 'شكرا جزيلا')",
        "- negative: user is unhappy, complaining about support quality",
        "  Examples: 'you are so bad', 'worst support', 'I don't like your support',",
        "  'thank you for nothing', 'useless', 'ما استفدت شي', 'دعم سيء', 'ما ساعدتني'",
        "- neutral: neither positive nor negative",
        "",
        `Message: "${messageContent.slice(0, 400)}"`,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"sentiment":"<positive|negative|neutral>","confidence":<0.0-1.0>}',
    ].join("\n");
}

export function buildStaffChatReminderPrompt(messages: string[]): string {
    const combined = messages.slice(-5).map((m, i) => `${i + 1}. "${m.slice(0, 100)}"`).join("\n");
    return [
        "You are a Discord support channel monitor.",
        "Messages may be in English or Arabic.",
        "Determine if the following messages in a SUPPORT channel are two staff chatting with each other instead of helping a user.",
        "",
        "Signs of staff-to-staff chat: casual conversation, jokes, off-topic discussion, not addressing any user issue.",
        "NOT staff chat: one staff asking another for help with a user issue, handoff, escalation.",
        "",
        "Recent messages:",
        combined,
        "",
        'Respond ONLY with raw JSON, no markdown, no code blocks: {"isStaffChat":<true|false>,"confidence":<0.0-1.0>}',
    ].join("\n");
}
