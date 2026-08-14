export interface ModuleCollision {
    kind: "command" | "component" | "message";
    name: string;
    /** Path of the registration that won. */
    kept: string;
    /** Path of the registration that was dropped. */
    ignored: string;
}

export interface InvalidModule {
    path: string;
    reason: string;
}

export interface LoadReport {
    commands: number;
    events: number;
    components: number;
    messages: number;
    features: number;
    collisions: ModuleCollision[];
    invalid: InvalidModule[];
    /** command name → the file that registered it, so a collision can name both sides. */
    commandSources: Map<string, string>;
    componentSources: Map<string, string>;
    messageSources: Map<string, string>;
}

export function createLoadReport(): LoadReport {
    return {
        commands: 0,
        events: 0,
        components: 0,
        messages: 0,
        features: 0,
        collisions: [],
        invalid: [],
        commandSources: new Map(),
        componentSources: new Map(),
        messageSources: new Map(),
    };
}
