export interface PendingModMail {
    userId: string;
    content: string;
    attachments: string[];
    language?: "en" | "ar";
}

export const pendingSessions = new Map<string, PendingModMail>();
