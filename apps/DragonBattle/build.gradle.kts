plugins {
    java
}

group = "org.robtic"
version = "1.0.4"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/") {
        name = "papermc"
    }
}

dependencies {
    // Provided by the server at runtime, so it is never shaded. 1.21.7 is the floor because that is
    // where Paper exposed the dialog and registry APIs this plugin builds against; it runs on any
    // 1.21.x at or above it.
    compileOnly("io.papermc.paper:paper-api:1.21.7-R0.1-SNAPSHOT")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release = 21
}

tasks.processResources {
    // plugin.yml carries the project's own version, so a release cannot ship a jar whose manifest
    // disagrees with its build file.
    val properties = mapOf("version" to project.version)
    inputs.properties(properties)

    filesMatching("plugin.yml") {
        expand(properties)
    }
}

tasks.jar {
    archiveFileName = "DragonBattle-${project.version}.jar"
}
