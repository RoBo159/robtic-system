package org.robtic.core.license;

import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.core.license.api.*;
import org.robtic.core.license.config.LicenseSettings;
import java.io.File;
import java.util.*;
import java.util.logging.*;

/** Loads the shipped licenses.yml through the real settings class and cross-checks references. */
public final class ConfigCheck {
    static int fail = 0;
    static void ok(String w, boolean c, String d) {
        if (c) System.out.println("  ok   " + w + (d.isEmpty()?"":" — "+d));
        else { fail++; System.out.println("  FAIL " + w + " — " + d); }
    }
    public static void main(String[] a) throws Exception {
        Logger log = Logger.getLogger("t"); log.setUseParentHandlers(false);
        StringBuilder warns = new StringBuilder();
        log.addHandler(new Handler(){
            public void publish(LogRecord r){warns.append(r.getMessage()).append("\n");}
            public void flush(){} public void close(){}});

        YamlConfiguration cfg = YamlConfiguration.loadConfiguration(new File(a[0]));
        LicenseSettings s = new LicenseSettings(cfg.getConfigurationSection("licenses"), log);

        ok("enabled by default", s.enabled(), "");
        ok("gui rows are legal", s.browserRows() >= 3 && s.browserRows() <= 6, s.browserRows()+" rows");
        // Sounds are registry-backed and unresolvable outside a running server. What matters here
        // is that asking for them did not throw — reaching this line at all proves it.
        System.out.println("  --   sounds skipped: registry-backed, needs a live server");
        ok("categories loaded", s.categories().size() >= 7, s.categories().size()+" categories");
        ok("licences loaded", s.licenses().size() >= 4, s.licenses().size()+" licences");
        ok("no warnings from the shipped file", warns.isEmpty(),
           warns.isEmpty()?"clean":("\n"+warns));

        // Registry + cross-references, as the module wires them.
        LicenseRegistry reg = new LicenseRegistry(log);
        s.categories().forEach(reg::register);
        int accepted = reg.registerAll(s.licenses());
        ok("every licence was accepted", accepted == s.licenses().size(),
           accepted + "/" + s.licenses().size());

        Set<String> catIds = new HashSet<>();
        reg.categories().forEach(c -> catIds.add(c.id()));

        for (License l : reg.all()) {
            ok("licence \"" + l.id() + "\" names a declared category",
               catIds.contains(l.categoryId()), l.categoryId());
        }

        // Statistic references must exist in statistics.yml, or nothing is recorded.
        YamlConfiguration st = YamlConfiguration.loadConfiguration(new File(a[1]));
        var statSection = st.getConfigurationSection("statistics.statistics");
        Set<String> statIds = statSection == null ? Set.of() : statSection.getKeys(false);

        for (License l : reg.all()) {
            if (!l.statisticId().isBlank()) {
                ok("licence \"" + l.id() + "\" names a declared statistic",
                   statIds.contains(l.statisticId()), l.statisticId());
            }
        }

        for (String required : List.of("licenses_obtained","licenses_renewed","licenses_expired",
                                       "licenses_used","licenses_revoked","license_renewal_spent")) {
            ok("statistics.yml declares " + required, statIds.contains(required), "");
        }

        System.out.println("\nShipped licences:");
        for (License l : reg.all()) {
            System.out.printf("  %-12s %-14s %s%n", l.id(),
                reg.category(l.categoryId()).id(),
                l.permanent() ? "permanent" : (l.initialPeriod().toDays()+"d, renew "
                    + l.renewalCost() + " robs"));
        }

        System.out.println(fail==0 ? "\nALL PASS" : "\n"+fail+" FAILURES");
        System.exit(fail==0?0:1);
    }
}
