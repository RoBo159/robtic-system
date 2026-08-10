import { existsSync } from "fs";
import path from "path";
import {
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    StringSelectMenuBuilder,
    type BaseMessageOptions,
} from "discord.js";
import type { IAdItem, IAdsConfig } from "@database/models/AdsConfig";
import { formatPrice } from "./pricing";
import type { CartItem } from "./cart-store";

const BANNER_PATH = path.join(process.cwd(), "images", "ads-banner.png");

function priceList(items: IAdItem[], rate: number): string {
    return items.map(i => `• **${i.name}** — ${formatPrice(i.priceUsd, rate)}`).join("\n");
}

/** The public ordering panel — banner, rules, prices, package buttons, add-ons select. */
export function buildAdsPanel(config: IAdsConfig): { components: ContainerBuilder[]; files: AttachmentBuilder[] } {
    const files: AttachmentBuilder[] = [];
    const container = new ContainerBuilder()

    if (existsSync(BANNER_PATH)) {
        const banner = new AttachmentBuilder(BANNER_PATH, { name: "ads-banner.png" });
        files.push(banner);
        container.addMediaGalleryComponents(mg =>
            mg.addItems(item => item.setURL("attachment://ads-banner.png").setDescription("Robtic Advertisements"))
        );
    }

    container.addTextDisplayComponents(td => td.setContent("## <:forward:1480426683570983014> الاعـلانـات"));

    container.addSectionComponents(sc =>
        sc.addTextDisplayComponents(td =>
            td.setContent("قبل الطلب الرجاء قراءة قوانين الاعلانات")
        ).setButtonAccessory(btn =>
            btn.setCustomId("ads-rules-view").setLabel("📜 عرض قوانين الإعلان").setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(sep => sep);

    const priceLines = [
        "## <:2reading:1479437373854187642> اسـعـار الاعـلانـات",
        priceList(config.standardAds, config.exchangeRate),
        "",
        priceList(config.giveaway, config.exchangeRate),
    ].join("\n");
    container.addTextDisplayComponents(td => td.setContent(priceLines));
    container.addSeparatorComponents(sep => sep);

    container.addTextDisplayComponents(td =>
        td.setContent("## 📦 الباقات\nاختر باقة من الأسفل لمعرفة تفاصيلها وإضافتها إلى طلبك.")
    );
    for (const p of config.packages) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(td =>
                td.setContent(`**${p.name}** — ${formatPrice(p.priceUsd, config.exchangeRate)}`)
            ).setButtonAccessory(btn =>
                btn.setCustomId(`ads-pack_${p.key}`).setLabel("🛒 عرض التفاصيل").setStyle(ButtonStyle.Primary)
            )
        );
    }
    container.addSeparatorComponents(sep => sep);

    if (config.addons.length) {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(td =>
                td.setContent("## ➕ الإضافات\nهل تريد إضافة أي شيء إضافي؟ اضغط الزر لاختيار الإضافات.")
            ).setButtonAccessory(btn =>
                btn.setCustomId("ads-addons-view").setLabel("➕ اختر الإضافات").setStyle(ButtonStyle.Secondary)
            )
        );
    }
    container.addSeparatorComponents(sep => sep);

    container.addActionRowComponents(row =>
        row.setComponents(
            new ButtonBuilder().setCustomId("ads-cart-view").setLabel("🛒 عرض السلة").setStyle(ButtonStyle.Success)
        )
    );

    return { components: [container], files };
}

/** Ephemeral picker shown after clicking the add-ons button — supports selecting multiple add-ons at once. */
export function buildAddonsSelector(config: IAdsConfig): BaseMessageOptions {
    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td => td.setContent("## ➕ الإضافات\nاختر إضافة واحدة أو أكثر لإضافتها إلى طلبك."))
        .addActionRowComponents(row =>
            row.setComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("ads-select-addon")
                    .setPlaceholder("اختر الإضافات")
                    .setMinValues(1)
                    .setMaxValues(Math.min(config.addons.length, 25))
                    .addOptions(
                        config.addons.slice(0, 25).map(a => ({
                            label: a.name.slice(0, 100),
                            value: a.key,
                            description: formatPrice(a.priceUsd, config.exchangeRate),
                        }))
                    )
            )
        );

    return { components: [container] };
}

export function buildRulesContainer(): BaseMessageOptions {
    const container = new ContainerBuilder()
        .setAccentColor(0xed4245)
        .addTextDisplayComponents(td => td.setContent("## 📜 قوانين الإعلانات"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td =>
            td.setContent(
                "• يجب إتمام الدفع قبل النشر.\n" +
                "• يجب أن تلتزم الإعلانات بقوانين المجتمع.\n" +
                "• يحق لـ Robtic رفض أي إعلان يخالف سياساتنا.\n" +
                "• قد تتغير الأسعار بناءً على سعر صرف الكريديت."
            )
        );

    return { components: [container] };
}

export function buildPackageDetail(item: IAdItem, rate: number): BaseMessageOptions {
    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td => td.setContent(`## ${item.name}`))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(item.details || "*لم يتم تحديد التفاصيل.*"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`**السعر:** ${formatPrice(item.priceUsd, rate)}`))
        .addActionRowComponents(row =>
            row.setComponents(
                new ButtonBuilder()
                    .setCustomId(`ads-cart-add_packages_${item.key}`)
                    .setLabel("🛒 أضف إلى السلة")
                    .setStyle(ButtonStyle.Success)
            )
        );

    return { components: [container] };
}

export function buildCartSummary(cart: CartItem[], rate: number, note?: string): BaseMessageOptions {
    const container = new ContainerBuilder().setAccentColor(0x2ecc71);

    if (note) {
        container.addTextDisplayComponents(td => td.setContent(note));
        container.addSeparatorComponents(sep => sep);
    }

    container.addTextDisplayComponents(td => td.setContent("## 🛒 سلتك"));

    if (!cart.length) {
        container.addTextDisplayComponents(td => td.setContent("*سلتك فارغة.*"));
        return { components: [container] };
    }
    container.addSeparatorComponents(sep => sep);

    cart.forEach((i, index) => {
        container.addSectionComponents(sc =>
            sc.addTextDisplayComponents(td =>
                td.setContent(`**${i.name}** — ${formatPrice(i.priceUsd, rate)}`)
            ).setButtonAccessory(btn =>
                btn.setCustomId(`ads-cart-remove_${index}`).setLabel("🗑️").setStyle(ButtonStyle.Danger)
            )
        );
    });

    const total = cart.reduce((sum, i) => sum + i.priceUsd, 0);
    container.addSeparatorComponents(sep => sep);
    container.addTextDisplayComponents(td => td.setContent(`**الإجمالي:** ${formatPrice(total, rate)}`));
    container.addActionRowComponents(row =>
        row.setComponents(
            new ButtonBuilder().setCustomId("ads-cart-confirm").setLabel("✅ تأكيد الطلب").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId("ads-cart-clear").setLabel("🗑️ إفراغ السلة").setStyle(ButtonStyle.Danger)
        )
    );

    return { components: [container] };
}
