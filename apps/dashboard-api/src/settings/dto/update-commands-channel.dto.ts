import { IsDiscordId } from "../../common";

export class UpdateCommandsChannelDto {
    @IsDiscordId()
    channelId: string;
}
