package org.robtic.minecraft.license;

import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.minecraft.license.api.*;
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

        License noIcon = parse("noicon:\n  display: x\n", "noicon", log);
        ok("a missing icon falls back", noIcon.icon().equals("PAPER"), noIcon.icon());
        ok("a missing category falls back", noIcon.categoryId().equals("custom"), noIcon.categoryId());
        ok("a missing rarity falls back", noIcon.rarity().equals("common"), noIcon.rarity());

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
            List.of(), "PAPER", 0, "common", 0, Duration.ZERO, Duration.ZERO,
            false, true, false, false, List.of(), List.of(), "", Map.of())), "");
        ok("unregisters", reg.unregister("w") && !reg.exists("w"), "");
        ok("an unknown category resolves to a placeholder",
           reg.category("nonexistent").id().equals("nonexistent"), "never null");

        System.out.println(fail==0 ? "\nALL PASS" : "\n"+fail+" FAILURES");
        System.exit(fail==0?0:1);
    }
}
