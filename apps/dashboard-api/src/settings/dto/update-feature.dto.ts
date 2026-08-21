import { IsBoolean } from "class-validator";

export class UpdateFeatureDto {
    @IsBoolean()
    enabled: boolean;
}
