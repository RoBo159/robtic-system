import { ActionRowBuilder, ContainerBuilder, SeparatorBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from "discord.js";
import type { PanelDefinition } from "../registry";

export interface ActivityOption {
    /** Select menu option value — also the customId suffix routed to in the component handler. */
    value: string;
    /** Select menu option label. */
    label: string;
    /** Select menu option description (shown under the label in the dropdown). */
    description: string;
    emoji?: string;
    /** Ephemeral message content shown when this option is picked. Edit freely. */
    content: string;
}

/**
 * The one list to edit for this panel: add/remove/reword topics here and both the select
 * menu and its ephemeral replies pick it up automatically — no other file needs to change.
 */
export const ACTIVITY_OPTIONS: ActivityOption[] = [
    {
        value: "xp",
        label: "نـظـام الـتـفـاعـل",
        description: "شوف كم تقدر تحصل بس من تفاعلك بالسيرفر",
        emoji: "⭐",
        content: `
        **السلام عليكم ورحمة الله وبركاته

روبتيك يقدم لكم أقوى نظام تفاعل :by_noobot~40: 

800 رسالة شات: 10,000,000 كردت <a:LG134:1512102207166746734> 
1000 رسالة شات: 17,000,000 كردت <a:LG134:1512102207166746734>
1500 رسالة شات: 25,000,000 كردت <a:LG134:1512102207166746734>
3000 رسالة شات: 40,000,000 كردت <a:LG134:1512102207166746734>

مستحيل ما تصير مطنوخ بعد هالنظام <a:LG134:1512102207166746734> 

- التسليم يوميًا بعد منتصف الليل  :purple_galaxymoon: 
- لمعرفة عدد رسائلك اكتب الأمر: !top :emoji_59: 
- التسليم يشمل جميع أعضاء الإدارة (حتى لو كانوا مخفين أو أونر أو شِب):049: 
- التسليم للتوب 10 فقط شد حيلك :Money: 
**
        `
    },
    {
        value: "streak",
        label: "نـظـام الـسـتـريـك",
        description: "اقوى جوايز يمكن تشوفها من نظام الستريك",
        emoji: "🔥",
        content: `
        **نظام الستريك اليومي <a:emoji_6:1512102901298892962> 


كل ما حافظت على تفاعلك اليومي ارتفع الستريك وحصلت على مكافآت أكبر <a:heros_warns:1512102869359394898> 

مكافآت الستريك

5 أيام 25,000,000 كريدت <a:LG134:1512102207166746734> 

10 أيام 50,000,000 كريدت <a:LG134:1512102207166746734>

15 يوم 70,000,000 كريدت <a:LG134:1512102207166746734>

20 يوم 90,000,000 كريدت <a:LG134:1512102207166746734>

25 يوم 100,000,000 كريدت <a:LG134:1512102207166746734>

30 يوم 150,000,000 كريدت <a:LG134:1512102207166746734>

40 يوم 200,000,000 كريدت <a:LG134:1512102207166746734>

50 يوم 500,000,000 كريدت <a:LG134:1512102207166746734>

60 يوم 750,000,000 كريدت <a:LG134:1512102207166746734>

70 يوم 1,000,000,000 كريدت <a:LG134:1512102207166746734>

80 يوم 1,350,000,000 كريدت <a:LG134:1512102207166746734>

90 يوم 1,800,000,000 كريدت <a:LG134:1512102207166746734>

100 يوم 2,500,000,000 كريدت <a:LG134:1512102207166746734>

القوانين <:Security_Red:1520890322400444687> 

لازم ترسل رسالة واحدة كل 24 ساعة حتى يستمر الستريك 

إذا مر 24 ساعة بدون رسالة ينصفر الستريك كامل

كل مكافأة تستلمها مرة واحدة فقط

أي استغلال للنظام يعرض صاحبه لتصفير الستريك وسحب المكافآت

حافظ على الستريك لأن يوم واحد بدون تفاعل يرجعك للبداية **`,
    },
    {
        value: "combo",
        label: "نـظـام الـكـومـبـو",
        description: "اعمل كومبو انت و خويك و فوز بافضل جوايز",
        emoji: "💬",
        content: `
        # مكافآت الكومبو

**1000 كومبو 5,000,000 كريدت <a:LG134:1512102207166746734>

2000 كومبو 10,000,000 كريدت <a:LG134:1512102207166746734>

5000 كومبو 25,000,000 كريدت <a:LG134:1512102207166746734>

10000 كومبو 60,000,000 كريدت <a:LG134:1512102207166746734>

15000 كومبو 100,000,000 كريدت <a:LG134:1512102207166746734>

25000 كومبو 200,000,000 كريدت <a:LG134:1512102207166746734>

القوانين <:Security_Red:1520890322400444687> 
كل رسالة تزيد الكومبو بمقدار 1
الكومبو لا ينقص ولا يتصفر عند التوقف عن التفاعل
حتى تشوف الكومبو الخاص فيك اكتب فقط !combo
كل مكافأة تستلمها مرة واحدة فقط في اليوم
التسليم فقط لاول 5 في قائمة الكومبو

أي استغلال للنظام يعرض صاحبه لتصفير الكومبو وسحب المكافآت  **
        `,
    },
];

function activitySystemContent(): ContainerBuilder {
    const select = new StringSelectMenuBuilder()
        .setCustomId("activity_system_select")
        .setPlaceholder("اخـتـر الـنـظـام الـذي تـريـده")
        .setOptions(
            ACTIVITY_OPTIONS.map(o => {
                const opt = new StringSelectMenuOptionBuilder()
                    .setLabel(o.label)
                    .setValue(o.value)
                    .setDescription(o.description);
                return o.emoji ? opt.setEmoji(o.emoji) : opt;
            })
        );

    return new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td => td.setContent("## الجوائز اليومية"))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(td =>
            td.setContent(
                "اقوى و افضل الانضمة الي يمكن تشوفها بس تعال اتفاعل و فوز يوميا معانا بجوايز و فعاليات ضخمة فقط المطلوب منك التفاعل"
            )
        )
        .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

export default {
    key: "activity-system",
    name: "📊 Activity System",
    mode: "container",
    accentColor: 0x5865F2,
    getContent() {
        return activitySystemContent();
    },
} satisfies PanelDefinition;
