import { IsBoolean } from "class-validator";

export class UpdateTierDto {
    @IsBoolean()
    enabled: boolean;
}
