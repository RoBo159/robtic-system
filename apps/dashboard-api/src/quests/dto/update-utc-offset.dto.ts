import { IsInt, Max, Min } from "class-validator";
import { MAX_UTC_OFFSET_MINUTES, MIN_UTC_OFFSET_MINUTES } from "../constants";

export class UpdateUtcOffsetDto {
    @IsInt()
    @Min(MIN_UTC_OFFSET_MINUTES)
    @Max(MAX_UTC_OFFSET_MINUTES)
    utcOffsetMinutes: number;
}
