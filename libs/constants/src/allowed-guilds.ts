/**
 * Guild ids inserted into the whitelist on first boot if they aren't already there.
 *
 * The whitelist itself lives in MongoDB and is managed with `/addserver`; this list exists only so
 * a fresh database — or a restore into one — comes up with the permanent Robtic servers already
 * authorised, instead of the bot leaving all of them before anyone can run a command.
 */
export const SEED_ALLOWED_GUILD_IDS: readonly string[] = [
    "1293702554663784561",
    "1459856238346244202",
    "1283878145463812188",
    "1175041837032013844",
    "1521603602349822223",
    "1304497912541216819",
    "1340750551197159447",
];
