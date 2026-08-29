package org.robtic.core.license.item;

import java.util.Locale;

/**
 * The scroll models a licence can be drawn as, and the only place their model data lives.
 *
 * <h2>Two numbers per variant, and nothing anywhere else</h2>
 *
 * Every licence is the same item — a {@link org.bukkit.Material#PAPER} — and the resource pack tells
 * them apart by custom model data alone. Each variant therefore owns exactly two values: how it looks
 * in date, and how it looks once it has lapsed. They are declared here and read through
 * {@link #modelData(boolean)}, so a pack that renumbers its models is edited in one enum rather than
 * hunted for across the item factory, the browser and whatever is written next.
 *
 * <h2>Which variant a licence gets</h2>
 *
 * From its configured rarity — see {@link #forRarity}. That keeps the visual tied to something the
 * server already decides and already shows in the GUI, rather than adding a second knob that could
 * disagree with the first. A rarity this build has no artwork for falls back to {@link #BLANK}, which
 * is also what an unowned licence is drawn as: an unstyled scroll is the honest picture of "nothing
 * specific to show here".
 */
public enum LicenseVariant {

    /** No artwork: an unowned licence, or a rarity nothing maps to. */
    BLANK(770, 7770),

    /** common */
    REGULAR(771, 7771),

    /** uncommon */
    IRON(772, 7772),

    /** rare */
    GOLD(773, 7773),

    /** epic */
    DIAMOND(774, 7774),

    /** legendary */
    JOKER(775, 7775);

    private final int modelData;
    private final int wornModelData;

    LicenseVariant(int modelData, int wornModelData) {
        this.modelData = modelData;
        this.wornModelData = wornModelData;
    }

    /** The in-date model. */
    public int modelData() {
        return modelData;
    }

    /** The lapsed model. */
    public int wornModelData() {
        return wornModelData;
    }

    /**
     * The model data to stamp on an item.
     *
     * @param worn whether the licence has expired. A permanent licence is never worn — it cannot
     *             lapse, so there is no state for the worn artwork to represent
     */
    public int modelData(boolean worn) {
        return worn ? wornModelData : modelData;
    }

    /**
     * The variant a rarity is drawn as.
     *
     * Rarity is a configured id rather than an enum precisely so a server can invent one, so this
     * cannot be exhaustive and does not try to be. An unrecognised rarity gets {@link #BLANK} rather
     * than a guess: showing a "Seasonal" licence as legendary because it sorted last would be a
     * worse answer than showing it as unstyled.
     */
    public static LicenseVariant forRarity(String rarity) {
        if (rarity == null) {
            return BLANK;
        }

        return switch (rarity.trim().toLowerCase(Locale.ROOT)) {
            case "common" -> REGULAR;
            case "uncommon" -> IRON;
            case "rare" -> GOLD;
            case "epic" -> DIAMOND;
            case "legendary" -> JOKER;
            default -> BLANK;
        };
    }
}
