package org.robtic.minecraft.structure;

import org.bukkit.Material;
import org.bukkit.configuration.file.YamlConfiguration;
import org.robtic.minecraft.structure.api.MarkerCategory;
import org.robtic.minecraft.structure.api.MarkerType;
import org.robtic.minecraft.structure.config.MarkerSettings;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Checks that the shipped {@code markers.yml} is coherent.
 *
 * <h2>Why the file needs a test at all</h2>
 *
 * Everything in this system is configuration, which is the design and also the risk: a marker naming
 * a category that does not exist, or two markers claiming the same NPC role, produces no error at
 * load and no error at runtime. It produces a building where one NPC silently never appears, months
 * later, in production.
 *
 * These are the errors an operator can make in their own file too, which is why the same checks run
 * on whatever path is passed in.
 */
public final class ConfigCheck {

    private static int failures;

    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("usage: ConfigCheck <markers.yml>");
            System.exit(2);
        }

        File file = new File(args[0]);

        if (!file.isFile()) {
            System.err.println("ConfigCheck: " + file + " does not exist.");
            System.exit(2);
        }

        MarkerSettings settings = new MarkerSettings(
                YamlConfiguration.loadConfiguration(file).getConfigurationSection("markers"),
                quietLogger());

        loads(settings);
        materialsAreUsable(settings);
        categoriesExist(settings);
        exactlyOneOfEachCorner(settings);
        rolesAreUnique(settings);
        iconsResolve(settings);
        levelsAreReachable(settings);

        if (failures > 0) {
            System.err.println("ConfigCheck: " + failures + " failure(s) in " + file + ".");
            System.exit(1);
        }

        System.out.println("ConfigCheck: " + file.getName() + " is coherent — "
                + settings.types().size() + " type(s), "
                + settings.categories().size() + " category(ies).");
    }

    private static void loads(MarkerSettings settings) {
        check("the file declares marker types", !settings.types().isEmpty());
        check("the file declares categories", !settings.categories().isEmpty());
    }

    /**
     * The marker block has to have a block entity, or nothing can ever be stored on it.
     *
     * This is the one misconfiguration that breaks the entire system while looking completely
     * reasonable in the file. There is no clean way to ask Bukkit "does this material have a block
     * entity" without a running server, so the check is a conservative allow-list of the families
     * that do: anything a builder would sensibly pick is in it.
     */
    private static void materialsAreUsable(MarkerSettings settings) {
        Material block = settings.blockMaterial();

        String name = block.name();

        boolean hasBlockEntity = name.endsWith("_SIGN")
                || name.endsWith("_HANGING_SIGN")
                || name.endsWith("SHULKER_BOX")
                || name.equals("CHEST")
                || name.equals("TRAPPED_CHEST")
                || name.equals("BARREL")
                || name.equals("HOPPER")
                || name.equals("DISPENSER")
                || name.equals("DROPPER")
                || name.equals("LECTERN")
                || name.equals("BEACON")
                || name.equals("STRUCTURE_BLOCK")
                || name.equals("JIGSAW");

        check("marker.block (" + name + ") is a block that can store data", hasBlockEntity);

        Material cleared = settings.clearedMaterial();

        // The cleared material must not be the marker material, or reading a structure would leave
        // every marker exactly where it was and the next scan would find them all again.
        check("marker.cleared-to differs from marker.block", cleared != block);
    }

    private static void categoriesExist(MarkerSettings settings) {
        Set<String> declared = new HashSet<>();

        for (MarkerCategory category : settings.categories()) {
            declared.add(category.id());
        }

        for (MarkerType type : settings.types()) {
            check("marker \"" + type.id() + "\" names a declared category (" + type.categoryId() + ")",
                    declared.contains(type.categoryId()));
        }
    }

    /**
     * Exactly one type claims each corner.
     *
     * Two types both declaring {@code bounds: origin} is not a builder error — it is a config error,
     * and it makes every structure ambiguous no matter how carefully it was built.
     */
    private static void exactlyOneOfEachCorner(MarkerSettings settings) {
        for (MarkerType.Bounds corner : List.of(MarkerType.Bounds.ORIGIN, MarkerType.Bounds.END)) {
            List<String> claiming = new ArrayList<>();

            for (MarkerType type : settings.types()) {
                if (type.bounds() == corner) {
                    claiming.add(type.id());
                }
            }

            check("exactly one type defines the " + corner.name().toLowerCase(Locale.ROOT)
                    + " corner (found " + claiming + ")", claiming.size() == 1);

            if (claiming.size() == 1) {
                MarkerType type = settings.types().stream()
                        .filter(candidate -> candidate.id().equals(claiming.get(0)))
                        .findFirst().orElseThrow();

                check("the " + corner.name().toLowerCase(Locale.ROOT)
                                + " marker is required and singular",
                        type.required() && type.cardinality().mandatory());
            }
        }
    }

    /**
     * No two marker types share an NPC role.
     *
     * The role is the only join between a marker and an NPC definition. Two markers claiming
     * {@code seller} means the position an NPC spawns at depends on iteration order, which is the
     * kind of bug that reproduces on one server and not another.
     */
    private static void rolesAreUnique(MarkerSettings settings) {
        Set<String> seen = new HashSet<>();

        for (MarkerType type : settings.types()) {
            if (!type.spawnsNpc()) {
                continue;
            }

            check("NPC role \"" + type.npcRole() + "\" is claimed by only one marker type",
                    seen.add(type.npcRole().toLowerCase(Locale.ROOT)));
        }
    }

    /**
     * Every icon names a material that exists.
     *
     * Resolved by name only. {@code Material#isBlock} and {@code Material#isAir} are registry-backed
     * on modern Paper and throw outside a running server, which would make this check impossible to
     * run anywhere it is useful. A name that resolves to a real enum constant is what is actually
     * being asked here anyway — the menu falls back to paper for anything else.
     */
    private static void iconsResolve(MarkerSettings settings) {
        for (MarkerType type : settings.types()) {
            check("marker \"" + type.id() + "\" has a real icon (" + type.icon() + ")",
                    resolves(type.icon()));
        }

        for (MarkerCategory category : settings.categories()) {
            check("category \"" + category.id() + "\" has a real icon (" + category.icon() + ")",
                    resolves(category.icon()));
        }
    }

    private static boolean resolves(String name) {
        if (name == null || name.isBlank()) {
            return false;
        }

        Material material = Material.matchMaterial(name.trim().toUpperCase(Locale.ROOT));

        return material != null && !material.name().equals("AIR");
    }

    /**
     * A required marker gated behind a building level could never be satisfied.
     *
     * Validation demands it be present; the level gate says it does not apply yet. Nothing resolves
     * that, and every structure would be rejected.
     */
    private static void levelsAreReachable(MarkerSettings settings) {
        for (MarkerType type : settings.types()) {
            if (type.required() && type.level() > 1) {
                check("required marker \"" + type.id() + "\" is not gated above level 1", false);
            }
        }
    }

    private static void check(String what, boolean passed) {
        if (!passed) {
            failures++;
            System.err.println("  FAIL  " + what);
        }
    }

    private static Logger quietLogger() {
        Logger logger = Logger.getLogger("marker-config-check");
        logger.setLevel(Level.OFF);
        return logger;
    }
}
