import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { connectDatabase } from "@database/connection";
import { AppModule } from "./app.module";
import { appConfig, databaseConfig, validate } from "./config";

async function bootstrap(): Promise<void> {
    validate(process.env);

    const app = appConfig();
    const database = databaseConfig();

    await connectDatabase(database.uri);

    const nest = await NestFactory.create(AppModule, { bodyParser: true });

    nest.use(cookieParser());

    nest.enableCors({
        origin: app.dashboardUrl,
        credentials: true,
    });

    nest.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    await nest.listen(app.port);
    Logger.log(`Dashboard API listening on ${app.publicApiUrl} (port ${app.port})`, "bootstrap");
}

/**
 * A failed bootstrap has to be readable in `docker logs`, because that is the only place anyone will
 * see it.
 *
 * When this service dies at startup, Compose reports the container as *unhealthy* and the deploy
 * fails on `dependency failed to start` — a message that names neither the service that broke nor
 * the reason. An unhandled promise rejection prints a stack trace with the cause somewhere in the
 * middle of it; this prints the cause first, framed, and then exits non-zero so the container is
 * restarted rather than lingering in a half-started state.
 */
bootstrap().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);

    console.error("\n" + "=".repeat(72));
    console.error("apps/dashboard-api failed to start");
    console.error("=".repeat(72));
    console.error(reason);
    console.error("=".repeat(72) + "\n");

    if (error instanceof Error && error.stack) console.error(error.stack);

    process.exit(1);
});
