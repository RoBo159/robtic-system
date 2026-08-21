import { IsString, Length, Matches } from "class-validator";

export class UpdatePrefixDto {
    /**
     * The prefix router does `content.startsWith(prefix)`, so whitespace would make every command
     * unreachable and an empty string would make every message one.
     */
    @IsString()
    @Length(1, 5)
    @Matches(/^\S+$/, { message: "prefix cannot contain spaces" })
    prefix: string;
}
