import type { MessageCollector } from "discord.js";

interface InterviewCollectors {
  DMCollector: MessageCollector;
  thrCollector: MessageCollector;
}

export const interviewCollectors = new Map<string, InterviewCollectors>(); //store collectors in a Map
