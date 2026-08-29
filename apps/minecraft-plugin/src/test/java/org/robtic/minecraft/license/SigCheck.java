package org.robtic.minecraft.license;

import org.robtic.minecraft.license.item.LicenseSignature;
import java.nio.file.*;
import java.util.logging.Logger;

/** Exercises the real LicenseSignature against the forgery cases the brief names. */
public final class SigCheck {
    static int fail = 0;
    static void ok(String w, boolean c, String d) {
        if (c) System.out.println("  ok   " + w + (d.isEmpty()?"":" — "+d));
        else { fail++; System.out.println("  FAIL " + w + " — " + d); }
    }

    public static void main(String[] a) throws Exception {
        Logger log = Logger.getLogger("t"); log.setUseParentHandlers(false);
        Path key = Path.of("D:/tmp/lic/keys/licenses.key");
        Files.deleteIfExists(key);

        LicenseSignature s = new LicenseSignature(key, log);
        ok("signing is active", s.active(), "key generated at " + key.getFileName());
        ok("key file was written", Files.isRegularFile(key), "");

        String sig = s.sign("workspace", "serial-1", 1000L, 2000L);
        ok("produces a signature", !sig.isEmpty(), sig.substring(0, Math.min(16, sig.length())) + "…");
        ok("verifies its own", s.verify("workspace", "serial-1", 1000L, 2000L, sig), "");

        System.out.println("Forgery attempts:");
        ok("a different licence id is rejected",
           !s.verify("founder", "serial-1", 1000L, 2000L, sig), "cannot upgrade a cheap licence");
        ok("an extended expiry is rejected",
           !s.verify("workspace", "serial-1", 1000L, 99999999L, sig), "cannot self-renew by NBT edit");
        ok("a different serial is rejected",
           !s.verify("workspace", "serial-2", 1000L, 2000L, sig), "cannot clone onto a new item");
        ok("an empty signature is rejected",
           !s.verify("workspace", "serial-1", 1000L, 2000L, ""), "a hand-written PDC has none");
        ok("a null signature is rejected",
           !s.verify("workspace", "serial-1", 1000L, 2000L, null), "");
        ok("a made-up signature is rejected",
           !s.verify("workspace", "serial-1", 1000L, 2000L, "AAAAAAAAAAAAAAAAAAAAAAAAAAA"), "");

        System.out.println("Key persistence:");
        LicenseSignature reloaded = new LicenseSignature(key, log);
        ok("a restart still validates old items",
           reloaded.verify("workspace", "serial-1", 1000L, 2000L, sig), "same key reloaded");

        System.out.println("Key rotation:");
        Files.delete(key);
        LicenseSignature rotated = new LicenseSignature(key, log);
        ok("a new key invalidates old items",
           !rotated.verify("workspace", "serial-1", 1000L, 2000L, sig),
           "deleting the key is a working revocation of everything");

        System.out.println("Separation between licences:");
        String w = rotated.sign("workspace", "s", 1L, 2L);
        String f = rotated.sign("founder", "s", 1L, 2L);
        ok("two licences sign differently", !w.equals(f), "");

        System.out.println(fail==0 ? "\nALL PASS" : "\n"+fail+" FAILURES");
        System.exit(fail==0?0:1);
    }
}
