/** One option node of a slash command's registered JSON schema. */
export interface OptionJSON {
    name: string;
    description?: string;
    type: number;
    required?: boolean;
    channel_types?: number[];
    options?: OptionJSON[];
}

/** The JSON shape of a registered slash command (`command.data.toJSON()`). */
export interface CommandJSON {
    name: string;
    description?: string;
    type?: number;
    options?: OptionJSON[];
}

/** Outcome of parsing a prefix invocation: a fake interaction, or a user-facing error. */
export interface ParseResult {
    interaction?: any;
    error?: string;
}

/** A message matched against a guild's configured /shortcut triggers. */
export interface ShortcutMatch {
    command: string;
    trigger: string;
    args: string;
    /** Configured cleanup, or undefined for shortcuts saved before the setting existed. */
    deleteMode?: "both" | "output" | "none";
}
