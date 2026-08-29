package org.robtic.core.license;

import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.license.api.*;
import org.robtic.core.license.item.LicenseVariant;
import java.io.File;
import java.time.Duration;
import java.util.*;
import java.util.logging.*;

/** Exercises the real License/LicenseHolding/LicenseRegistry against the brief's validation list. */
public final class LogicCheck {
    static int fail = 0;
    static void ok(String w, boolean c, String d) {
        if (c) System.out.println("  ok   " + w + (d.isEmpty()?"":" — "+d));
        else { fail++; System.out.println("  FAIL " + w + " — " + d); }
    }
    static License parse(String yaml, String key, Logger log) throws Exception {
        File f = File.createTempFile("lic", ".yml");
        java.nio.file.Files.writeString(f.toPath(), yaml);
        YamlConfiguration c = YamlConfiguration.loadConfiguration(f);
        return License.parse(key, c.getConfigurationSection(key), log).orElse(null);
    }

    /**
     * The scroll models, against the numbers the resource pack actually ships.
     *
     * Written out literally rather than looped over the enum: a test that derived the expected value
     * from the same enum it is checking would pass for any numbering, including a wrong one. These
     * are the pack's values, and the point is to fail if the enum drifts from them.
     */
    static void variants() {
        System.out.println("\nScroll models:");

        record Case(String rarity, LicenseVariant variant, int normal, int worn) { }

        List<Case> cases = List.of(
                new Case("common", LicenseVariant.REGULAR, 771, 7771),
                new Case("uncommon", LicenseVariant.IRON, 772, 7772),
                new Case("rare", LicenseVariant.GOLD, 773, 7773),
                new Case("epic", LicenseVariant.DIAMOND, 774, 7774),
                new Case("legendary", LicenseVariant.JOKER, 775, 7775));

        for (Case c : cases) {
            LicenseVariant resolved = LicenseVariant.forRarity(c.rarity());

            ok(c.rarity() + " is drawn as " + c.variant(), resolved == c.variant(), resolved.name());
            ok(c.rarity() + " in date = " + c.normal(),
               resolved.modelData(false) == c.normal(), "" + resolved.modelData(false));
            ok(c.rarity() + " worn = " + c.worn(),
               resolved.modelData(true) == c.worn(), "" + resolved.modelData(true));
        }

        ok("blank is 770 / 7770",
           LicenseVariant.BLANK.modelData() == 770 && LicenseVariant.BLANK.wornModelData() == 7770,
           LicenseVariant.BLANK.modelData() + " / " + LicenseVariant.BLANK.wornModelData());

        // A server inventing a rarity must not be silently drawn as something it is not.
        ok("an unknown rarity is blank",
           LicenseVariant.forRarity("seasonal") == LicenseVariant.BLANK, "no artwork to guess at");
        ok("a null rarity is blank",
           LicenseVariant.forRarity(null) == LicenseVariant.BLANK, "");
        ok("rarity matching ignores case and padding",
           LicenseVariant.forRarity("  LEGENDARY ") == LicenseVariant.JOKER, "");

        // Every variant must be distinct in both states, or two licences would be indistinguishable.
        Set<Integer> all = new HashSet<>();
        for (LicenseVariant v : LicenseVariant.values()) {
            all.add(v.modelData());
            all.add(v.wornModelData());
        }
        ok("every model number is unique",
           all.size() == LicenseVariant.values().length * 2, all.size() + " distinct");
    }

    public static void main(String[] a) throws Exception {
        Logger log = Logger.getLogger("t"); log.setUseParentHandlers(false);
        StringBuilder warns = new StringBuilder();
        log.addHandler(new Handler(){
            public void publish(LogRecord r){warns.append(r.getMessage()).append("\n");}
            public void flush(){} public void close(){}});

        System.out.println("Validation — the brief's list:");

        License neg = parse("bad:\n  renewal-cost: -500\n  duration-minutes: 1440\n", "bad", log);
        ok("negative renewal cost is clamped", neg.renewalCost() == 0.0, "got " + neg.renewalCost());

        License negDur = parse("bad2:\n  duration-minutes: -99\n", "bad2", log);
        ok("negative duration becomes permanent + warns", negDur.permanent()
           && warns.toString().contains("is negative"), "warned and treated as never-expires");

        License badId = parse("Bad Id:\n  display: x\n", "Bad Id", log);
        ok("an invalid id is refused", badId == null, "ids are permission/placeholder fragments");

        License bare = parse("bare:\n  display: x\n", "bare", log);
        ok("a missing category falls back", bare.categoryId().equals("custom"), bare.categoryId());
        ok("a missing rarity falls back", bare.rarity().equals("common"), bare.rarity());

        variants();

        License stacky = parse("s:\n  stackable: true\n  duration-minutes: 1440\n", "s", log);
        ok("an expiring licence cannot stack", !stacky.stackable(),
           "a stack shares one NBT — renewing one would renew all");

        License permStack = parse("p:\n  stackable: true\n  duration-minutes: 0\n", "p", log);
        ok("a permanent licence may stack", permStack.stackable(), "no per-item dates to clash");

        License noRenew = parse("n:\n  duration-minutes: 1440\n  renewal-minutes: 0\n", "n", log);
        ok("renewable with a zero period cannot renew", !noRenew.canRenew(),
           "would charge and add nothing");

        System.out.println("\nExpiry and renewal:");
        License lic = parse("w:\n  duration-minutes: 60\n  renewal-minutes: 60\n  renewal-cost: 100\n", "w", log);
        long now = 1_000_000L;

        ok("expiry is issue + duration", lic.expiryFrom(now) == now + 3_600_000L,
           "60 minutes");
        ok("a permanent licence has expiry 0", permStack.expiryFrom(now) == 0L, "");

        LicenseHolding live = new LicenseHolding(lic, null, LicenseHolding.Location.INVENTORY, 0,
                now, now + 3_600_000L);
        ok("not expired before its time", !live.expired(now + 1000L), "");
        ok("expired at its time", live.expired(now + 3_600_000L), "boundary is inclusive");
        ok("status reflects it", live.status(now).usable() && !live.status(now+3_600_000L).usable(), "");

        System.out.println("\nRenewing EARLY must not lose time:");
        long renewed = live.renewedExpiry(now + 60_000L, Duration.ofMinutes(60));
        ok("adds to the existing expiry", renewed == now + 3_600_000L + 3_600_000L,
           "1h left + 1h renewal = 2h, not 1h");

        System.out.println("Renewing LATE must not stay expired:");
        LicenseHolding dead = new LicenseHolding(lic, null, LicenseHolding.Location.INVENTORY, 0,
                0L, 1000L);
        long revived = dead.renewedExpiry(now, Duration.ofMinutes(60));
        ok("extends from now, not from the past", revived == now + 3_600_000L,
           "a month-dead licence renews to a live one");
        ok("and is genuinely usable", revived > now, "");

        System.out.println("\nPermanent handling:");
        LicenseHolding forever = new LicenseHolding(permStack, null,
                LicenseHolding.Location.INVENTORY, 0, now, 0L);
        ok("never expires", !forever.expired(Long.MAX_VALUE - 1), "");
        ok("reports permanent", forever.permanent(), "");
        ok("remaining is zero, distinguished by permanent()",
           forever.remaining(now).isZero() && forever.permanent(), "not confused with 'ran out'");

        System.out.println("\nRegistry:");
        LicenseRegistry reg = new LicenseRegistry(log);
        ok("registers", reg.register(lic), "");
        ok("exists", reg.exists("w"), "");
        ok("case-insensitive lookup", reg.get("W").isPresent(), "ids are normalised");
        ok("re-registering replaces", reg.register(lic) && reg.size() == 1, "reload-safe");
        ok("an invalid id is refused", !reg.register(new License("BAD ID", "c", "x",
            List.of(), "common", 0, Duration.ZERO, Duration.ZERO,
            false, true, false, false, List.of(), List.of(), "", Map.of())), "");
        ok("unregisters", reg.unregister("w") && !reg.exists("w"), "");
        ok("an unknown category resolves to a placeholder",
           reg.category("nonexistent").id().equals("nonexistent"), "never null");

        System.out.println(fail==0 ? "\nALL PASS" : "\n"+fail+" FAILURES");
        System.exit(fail==0?0:1);
    }
}
