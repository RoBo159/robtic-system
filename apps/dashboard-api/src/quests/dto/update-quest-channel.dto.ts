import { IsDiscordId } from "../../common";

/**
 * One channel id, used by both `settings/quest-channel` and `settings/community-channel`.
 *
 * A single class for the two routes rather than two identical ones. Which channel is being set is
 * already in the path — encoding it a second time in a DTO class name would be a distinction the
 * validator cannot act on.
 */
export class UpdateQuestChannelDto {
    @IsDiscordId()
    channelId: string;
}
