import type { BotClient } from "@core/BotClient";
import type { DMChannel } from "discord.js";
import { interviewCollectors } from "./interviewCollectors";

export async function startInterview(
  client: BotClient,
  thr,
  DM: DMChannel,
  userId: string,
  managerId: string,
  dep: Department,
) {
  const timer = 300000;

  const DMCollector = DM.createMessageCollector({
    filter: (msg) => !msg.author.bot,
    time: timer,
  });

  const thrCollector = thr.createMessageCollector({
    filter: (msg) => msg.author.id === managerId,
    time: timer,
  });

  //set collectors in Map so i can stop them using command
  interviewCollectors.set(userId, { DMCollector, thrCollector });

  DMCollector.on("collect", async (msg) => {
    await thr.send(msg.content);
  });

  thrCollector.on("collect", async (msg) => {
    msg.react("✅");
    await DM.send(msg.content);
  });

  DMCollector.on("end", async (_, reason) => {
    if (reason === "time") {
      thrCollector.stop();
      await thr.send(
        `<@${managerId}>, the interview has ended. Please take an action\n/interview accept\n/interview reject`,
      );
      await DM.send(
        "The interview has ended, waiting for the manager to take action",
      );
    }
  });
}
