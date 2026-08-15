import { FeatureCatalog, type IFeatureCatalog } from "@database/models/FeatureCatalog";

export interface FeatureCatalogEntry {
    key: string;
    description: string;
    activation: "opt-in" | "default-on";
    commands: string[];
}

export class FeatureCatalogRepository {
    /**
     * Replaces the catalog with what the running bot actually loaded.
     *
     * A full replace rather than an upsert-only pass, so deleting a feature folder removes it from
     * the panel on the next boot instead of leaving a toggle for something that no longer exists.
     */
    static async publish(entries: FeatureCatalogEntry[]): Promise<void> {
        const keys = entries.map(e => e.key);

        await Promise.all(entries.map(entry =>
            FeatureCatalog.findOneAndUpdate({ key: entry.key }, { $set: entry }, { upsert: true })
        ));

        await FeatureCatalog.deleteMany({ key: { $nin: keys } });
    }

    static async list(): Promise<IFeatureCatalog[]> {
        return FeatureCatalog.find().sort({ key: 1 });
    }
}
