import type { BotClient } from "@core/bot-client";
import type { DMChannel, ThreadChannel } from "discord.js";
import { INTERVIEW_TIMEOUT_MS, INTERVIEW_MESSAGES } from "@constants";
import { interviewCollectors } from "./interview-collectors";

export async function startInterview(
    client: BotClient,
    thr: ThreadChannel,
    DM: DMChannel,
    userId: string,
    managerId: string,
    dep: string,
) {
    const DMCollector = DM.createMessageCollector({
        filter: (msg) => !msg.author.bot,
        time: INTERVIEW_TIMEOUT_MS,
    });

    const thrCollector = thr.createMessageCollector({
        filter: (msg) => msg.author.id === managerId,
        time: INTERVIEW_TIMEOUT_MS,
    });

    interviewCollectors.set(userId, { DMCollector, thrCollector });

    DMCollector.on("collect", async (msg) => {
        await thr.send(msg.content);
    });

    thrCollector.on("collect", async (msg) => {
        msg.react(INTERVIEW_MESSAGES.managerAckReaction);
        await DM.send(msg.content);
    });

    DMCollector.on("end", async (_, reason) => {
        if (reason === "time") {
            thrCollector.stop();
            await thr.send(INTERVIEW_MESSAGES.endedManagerPrompt(managerId));
            await DM.send(INTERVIEW_MESSAGES.endedApplicantNotice);
        }
    });
}
